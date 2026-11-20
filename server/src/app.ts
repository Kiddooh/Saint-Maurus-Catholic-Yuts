import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { publicSite } from './public-site.js';
import { notifyUser, notifyRoles, bestEffort, signalNotification } from './notifications.js';
import { z, ZodError } from 'zod';
import { User, Event, Registration, Message, Article, Resource, Reaction, Comment, Membership, Progress, Inventory, Broadcast, Bookmark, Report, LedgerEntry, Notification } from './models.js';

const app = express();
// Injectable services keep workflow tests independent of a real MongoDB.
app.locals.notifyUser = notifyUser; app.locals.notifyRoles = notifyRoles; app.locals.signalNotification = signalNotification;
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  frameSrc: ["'self'", 'https://www.google.com'],
  // Explicit same-host WebSocket origins for browsers where CSP 'self' excludes ws/wss.
  connectSrc: ["'self'", (req) => {
    const host = req.headers.host || '';
    if (!/^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::[0-9]{1,5})?$/.test(host)) return "'self'";
    return 'wss://' + host;
  }, (req) => {
    const host = req.headers.host || '';
    if (process.env.NODE_ENV === 'production' || !/^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::[0-9]{1,5})?$/.test(host)) return "'self'";
    return 'ws://' + host;
  }]
} } }));
// Logs contain only server-generated IDs, route patterns and timing; no query, body, cookie or account information.
app.use((req, res, next) => {
  const requestId = randomUUID(); res.locals.requestId = requestId; res.set('X-Request-ID', requestId);
  const start = process.hrtime.bigint();
  if (process.env.HTTP_LOGGING === 'true') res.on('finish', () => {
    const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
    console.log(JSON.stringify({ level: 'info', event: 'http_request', requestId, method: req.method, route, status: res.statusCode, durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e6) }));
  });
  next();
});
app.use(express.json({ limit: '220kb' }));
app.use(cookieParser());
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
// Reject cross-origin browser mutations. Requests with no Origin are allowed for non-browser clients;
// browsers send Origin on these requests, and JSON-only requests cannot be sent as simple forms.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin) {
      try { const parsed = new URL(origin); if (parsed.origin !== origin || parsed.host !== req.get('host') || (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) return res.status(403).json({ error: 'Cross-origin request denied.' }); }
      catch { return res.status(403).json({ error: 'Invalid origin.' }); }
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON is required.' });
  }
  next();
});
const secret = () => process.env.JWT_SECRET || '';
const isReady = () => mongoose.connection.readyState === 1 && secret().length >= 32;
app.get('/health/live', (_req, res) => res.set('Cache-Control','no-store').json({ status: 'alive' }));
app.get('/health/ready', (_req, res) => res.set('Cache-Control','no-store').status(isReady() ? 200 : 503).json({ status: isReady() ? 'ready' : 'not_ready' }));
app.get('/api/health', (_req, res) => res.json({ status: isReady() ? 'ready' : 'configuration_required', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.use('/api', (_req, res, next) => { if (!isReady()) return res.status(503).json({ error: 'The service is not configured yet. Please try again later.' }); next(); });
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next); };
type AuthReq = Request & { sessionVersion?: number; account?: { id: string; role: string; name: string; email: string; bio: string; avatar: string } };
const auth = wrap(async (req: AuthReq, res, next) => {
  try {
    const token = req.cookies?.session;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const user = await User.findById(payload.sub).select('name email role sessionVersion bio avatar active');
    if (!user || user.active === false || payload.ver !== user.sessionVersion) return res.status(401).json({ error: 'Session expired. Please sign in.' });
    req.account = { id: user.id, role: user.role, name: user.name, email: user.email, bio: user.bio || '', avatar: user.avatar || '' }; req.sessionVersion = payload.ver; next();
  } catch { return res.status(401).json({ error: 'Session expired. Please sign in.' }); }
});
const admin = (req: AuthReq, res: Response, next: NextFunction) => req.account?.role === 'admin' ? next() : res.status(403).json({ error: 'Administrator access required.' });
const financeAccess = (req: AuthReq, res: Response, next: NextFunction) => ['admin','finance'].includes(req.account?.role || '') ? next() : res.status(403).json({ error: 'Finance access required.' });
const moderationAccess = (req: AuthReq, res: Response, next: NextFunction) => ['admin','moderator'].includes(req.account?.role || '') ? next() : res.status(403).json({ error: 'Moderation access required.' });
const managedRoles = ['member','finance','moderator'] as const;
// Confidential project PDFs live outside the public web root and Git.
const sourceDocs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs');
const projectDocuments = [
  ['client-proposal.pdf','Client proposal & agreement'], ['technical-upgrade.pdf','Technical upgrade plan'],
  ['phase-2-ux-content.pdf','UX and content review'], ['phase-3-implementation.pdf','Implementation & setup guide'],
  ['phase-4-spa-dashboards.pdf','SPA & dashboard guide'], ['phase-5-faith-library-profiles.pdf','Faith library & profiles'],
  ['phase-6-community-library.pdf','Community & faith library'], ['phase-7-accounts-broadcasts-security.pdf','Accounts, broadcasts & security'],
  ['phase-8-private-documents.pdf','Private documents & resource controls'], ['phase-9-mobile-search-operations.pdf','Mobile, search & operations'], ['phase-10-church-accounts-security.pdf','Church accounts & security'], ['phase-11-role-dashboards.pdf','Mobile dashboards & roles'], ['phase-12-map-notifications.pdf','Location & notifications'], ['phase-13-accessible-appearance.pdf','Appearance, accessibility & setup'], ['phase-14-terms-compliance.pdf','Header & policy review'], ['agreement-compliance-milestones.pdf','Draft agreement, compliance & milestones'], ['phase-15-church-theme.pdf','Church themes & appearance'], ['phase-16-map-themes.pdf','Map loading & colour palettes'],
] as const;
function resolvedPath(p: string) { try { return fs.realpathSync(p); } catch { return path.resolve(p); } }
function containsPath(root: string, child: string) { const rel = path.relative(resolvedPath(root), resolvedPath(child)); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); }
function privateDocsRoot(): string | null {
  const configured = process.env.PRIVATE_DOCS_DIR;
  if ((!configured || !path.isAbsolute(configured)) && process.env.NODE_ENV === 'production') return null;
  const dir = resolvedPath(configured || sourceDocs);
  if (process.env.WEB_DIST && containsPath(process.env.WEB_DIST, dir)) return null;
  return dir;
}
function existingDocument(root: string, name: string): string | null {
  try { const file = path.join(root, name); if (!fs.statSync(file).isFile() || !containsPath(root, file)) return null; return file; }
  catch { return null; }
}
app.get('/api/admin/documents', auth, admin, (_req, res) => {
  const dir = privateDocsRoot(); if (!dir) return res.status(503).json({ error: 'Private document storage is not configured safely.' });
  res.json({ documents: projectDocuments.filter(([file]) => existingDocument(dir, file)).map(([file, title]) => ({ file, title })) });
});
app.get('/api/admin/documents/:name', auth, admin, (req, res, next) => {
  const dir = privateDocsRoot(); if (!dir) return res.status(503).json({ error: 'Private document storage is not configured safely.' });
  const entry = projectDocuments.find(([file]) => file === req.params.name);
  const file = entry && existingDocument(dir, entry[0]);
  if (!entry || !file) return res.status(404).json({ error: 'Document not found.' });
  res.download(file, entry[0], { cacheControl: false }, err => { if (err) { if (res.headersSent) return next(err); res.status(404).json({ error: 'Document not available.' }); } });
});
const validId = (id: string) => mongoose.isValidObjectId(id);
const idOr404 = (req: Request, res: Response, next: NextFunction) => validId(req.params.id) ? next() : res.status(404).json({ error: 'Not found.' });
const sensitiveLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 12, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sensitive operations. Please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const password = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.');
// Compare against a fixed cost-matched hash even when the account does not exist.
const dummyPasswordHash = '$2a$12$18lDAechkHdq81Rr4K10muJ2Vh/Qiz1WXTgHVrUHi1WGwejAIT9Ka';
const currentPassword = z.string().min(1).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Invalid password.');
const loginSchema = z.object({ email, password: z.string().min(1).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Invalid password.') });
const registerSchema = z.object({ name: text(2,100), email, password, adult: z.literal(true) });
const eventSchema = z.object({ title: text(2,120), description: text(2,2000), date: z.string().datetime({ offset: true }), location: text(2,160), published: z.boolean() });
const articleSchema = z.object({ title: text(2,120), body: text(2,10000), published: z.boolean() });
const safeLink = z.string().trim().max(2048).refine(v => { if (!v) return true; try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } }, 'Provide a valid HTTPS link.');
const resourceSchema = z.object({ kind: z.enum(['sermon', 'teaching', 'library', 'music', 'bible', 'meditation']), title: text(2,120), description: text(2,2000), body: z.string().trim().max(10000), url: safeLink, published: z.boolean(), placements: z.array(z.enum(['library','resources','meditations'])).max(3).optional() })
  .refine(v => !v.placements || new Set(v.placements).size === v.placements.length, 'Duplicate placements are not allowed.')
  .refine(v => !v.published || !v.placements || v.placements.length > 0, 'Choose at least one public destination before publishing.')
  .transform(v => ({ ...v, placements: v.placements ?? (v.kind === 'meditation' ? ['library','resources','meditations'] : ['library','resources']) }));
const broadcastSchema = z.object({ title: text(2,120), description: text(2,2000), url: safeLink.refine(v => !!v, 'A stream or recording link is required.'), status: z.enum(['scheduled','live','recorded']), scheduledAt: z.union([z.iso.datetime({ offset: true }), z.literal('')]), published: z.boolean() });
const inventorySchema = z.object({ name: text(2,120), category: text(2,80), quantity: z.number().int().min(0).max(1000000), location: text(2,120), notes: z.string().trim().max(1000) });
const avatarSchema = z.string().max(165000).refine(v => { if (!v) return true; if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v)) return false; const b = Buffer.from(v.slice(23), 'base64'); return b.length <= 120000 && b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff; }, 'Please use a JPEG image under 120 KB.');
// Re-check the administrator's password immediately before sensitive changes; never log it.
async function verifyPassword(req: AuthReq, value: string, roles: readonly string[]) {
  const user = await User.findById(req.account!.id).select('+passwordHash');
  return !!user && roles.includes(user.role) && user.role === req.account!.role && user.active !== false && user.sessionVersion === req.sessionVersion && await bcrypt.compare(value, user.passwordHash || dummyPasswordHash);
}
const verifyAdminPassword = (req:AuthReq, value:string) => verifyPassword(req,value,['admin']);
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/', maxAge: 8 * 60 * 60 * 1000 };
function session(res: Response, id: string, version: number) { res.cookie('session', jwt.sign({ ver: version }, secret(), { subject: id, expiresIn: '8h', algorithm: 'HS256' }), cookieOptions); }
app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  try { const user = await User.create({ name: data.name, email: data.email, passwordHash }); session(res, user.id, user.sessionVersion); return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, bio: user.bio || '', avatar: user.avatar || '' } }); }
  catch (e: any) { if (e.code === 11000) return res.status(409).json({ error: 'An account with that email already exists.' }); throw e; }
}));
app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const data = loginSchema.parse(req.body); const user = await User.findOne({ email: data.email }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(data.password, user?.passwordHash || dummyPasswordHash);
  if (!user || user.active === false || !passwordMatches) return res.status(401).json({ error: 'Invalid email or password.' });
  session(res, user.id, user.sessionVersion); return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, bio: user.bio || '', avatar: user.avatar || '' } });
}));
app.post('/api/auth/logout', auth, wrap(async (req: AuthReq, res) => { await User.findByIdAndUpdate(req.account!.id, { $inc: { sessionVersion: 1 } }); await bestEffort(()=>app.locals.signalNotification(req.account!.id)); res.clearCookie('session', { ...cookieOptions, maxAge: undefined }); res.json({ ok: true }); }));
app.get('/api/auth/me', auth, (req: AuthReq, res) => res.json({ user: req.account }));
app.patch('/api/auth/me', auth, wrap(async (req: AuthReq, res) => { const data = z.object({ name: text(2,100), bio: z.string().trim().max(500).optional(), avatar: avatarSchema.optional() }).parse(req.body); const user = await User.findByIdAndUpdate(req.account!.id, data, { new: true, runValidators: true }).select('name email role bio avatar'); if (!user) return res.status(404).json({ error: 'Account not found.' }); res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, bio: user.bio || '', avatar: user.avatar || '' } }); }));
app.post('/api/auth/password', authLimiter, auth, wrap(async (req: AuthReq, res) => {
  const data = z.object({ currentPassword: z.string().min(1).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Invalid password.'), newPassword: password }).parse(req.body);
  const user = await User.findById(req.account!.id).select('+passwordHash');
  if (!user || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) return res.status(400).json({ error: 'Current password is incorrect.' });
  user.passwordHash = await bcrypt.hash(data.newPassword, 12); user.sessionVersion += 1; await user.save();
  await bestEffort(()=>app.locals.signalNotification(req.account!.id));
  session(res, user.id, user.sessionVersion); return res.json({ ok: true });
}));
app.get('/api/events', wrap(async (req, res) => {
  const query = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }).parse(req.query);
  const from = query.from ? new Date(query.from) : new Date(); const to = query.to ? new Date(query.to) : undefined;
  if (to && (to <= from || to.getTime() - from.getTime() > 93 * 86400000)) return res.status(400).json({ error: 'Invalid event date range.' });
  const range: { $gte: Date; $lt?: Date } = { $gte: from }; if (to) range.$lt = to;
  return res.json({ events: await Event.find({ published: true, date: range }).sort({ date: 1 }).limit(100).lean() });
}));
app.get('/api/events/:id', idOr404, wrap(async (req, res) => { const event = await Event.findOne({ _id: req.params.id, published: true, date: { $gte: new Date() } }).lean(); if (!event) return res.status(404).json({ error: 'Event not found.' }); res.json({ event }); }));
app.get('/api/resources', wrap(async (req, res) => {
  const { placement } = z.object({ placement: z.enum(['library','resources','meditations']).optional() }).parse(req.query);
  const legacy = placement === 'meditations' ? { placements: { $exists: false }, kind: 'meditation' } : { placements: { $exists: false } };
  const filter = placement ? { published: true, $or: [{ placements: placement }, legacy] } : { published: true };
  res.json({ resources: await Resource.find(filter).sort({ createdAt: -1 }).limit(100).lean() });
}));
// Public text search is bounded and never queries private accounts, messages or drafts.
app.get('/api/search', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }), wrap(async (req, res) => {
  const { q } = z.object({ q: text(2,80).regex(/^[\p{L}\p{N}\s]+$/u, 'Use letters, numbers and spaces only.') }).strict().parse(req.query);
  const filter = { published: true, $text: { $search: q } };
  const [articles, resources, events, broadcasts] = await Promise.all([
    Article.find(filter).select('title body').sort({ createdAt: -1 }).limit(8).maxTimeMS(3000).lean(),
    Resource.find({ ...filter, $or: [{ 'placements.0': { $exists: true } }, { placements: { $exists: false } }] }).select('title description kind placements').sort({ createdAt: -1 }).limit(8).maxTimeMS(3000).lean(),
    Event.find({ ...filter, date: { $gte: new Date() } }).select('title description').sort({ date: 1 }).limit(8).maxTimeMS(3000).lean(),
    Broadcast.find(filter).select('title description').sort({ createdAt: -1 }).limit(8).maxTimeMS(3000).lean()
  ]);
  const results = [
    ...articles.map(a => ({ type: 'Community', title: a.title, description: a.body.slice(0,180), url: '/community?post='+a._id })),
    ...resources.map(r => { const places = r.placements || (r.kind === 'meditation' ? ['library','resources','meditations'] : ['library','resources']); const place = places.includes('library') ? 'library' : places.includes('resources') ? 'resources' : 'meditations'; return { type: 'Resource', title: r.title, description: r.description.slice(0,180), url: '/'+place+'?resource='+r._id }; }),
    ...events.map(e => ({ type: 'Event', title: e.title, description: e.description.slice(0,180), url: '/events?event='+e._id })),
    ...broadcasts.map(b => ({ type: 'Broadcast', title: b.title, description: b.description.slice(0,180), url: '/broadcasts?item='+b._id }))
  ];
  res.json({ results });
}));
app.get('/api/resources/:id', idOr404, wrap(async (req, res) => { const { placement } = z.object({ placement: z.enum(['library','resources','meditations']) }).parse(req.query); const legacy = placement === 'meditations' ? { placements: { $exists: false }, kind: 'meditation' } : { placements: { $exists: false } }; const resource = await Resource.findOne({ _id: req.params.id, published: true, $or: [{ placements: placement }, legacy] }).lean(); if (!resource) return res.status(404).json({ error: 'Resource not found.' }); res.json({ resource }); }));
app.get('/api/articles', wrap(async (_req, res) => res.json({ articles: await Article.find({ published: true }).select('title body authorLabel broadcast createdAt').sort({ createdAt: -1 }).limit(30).lean() })));
// Account-owned notifications, never user-selected recipients.
app.get('/api/notifications', auth, wrap(async (req:AuthReq,res) => {
  const [items,unread]=await Promise.all([Notification.find({user:req.account!.id}).select('message target readAt createdAt').sort({_id:-1}).limit(50).lean(),Notification.countDocuments({user:req.account!.id,readAt:null})]);
  res.json({items,unread});
}));
app.patch('/api/notifications/read-all', auth, wrap(async (req:AuthReq,res) => {
  await Notification.updateMany({user:req.account!.id,readAt:null},{$set:{readAt:new Date()}});
  await bestEffort(()=>app.locals.signalNotification(req.account!.id));res.json({ok:true});
}));
app.patch('/api/notifications/:id/read', auth, idOr404, wrap(async (req:AuthReq,res) => {
  const result=await Notification.updateOne({_id:req.params.id,user:req.account!.id},{$set:{readAt:new Date()}});
  if(!result.matchedCount)return res.status(404).json({error:'Notification not found.'});
  await bestEffort(()=>app.locals.signalNotification(req.account!.id));return res.json({ok:true});
}));
// Public reading, authenticated contributions, and explicit moderation before publication.
const communityLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many community actions. Please try again later.' } });
app.get('/api/community', wrap(async (_req, res) => {
  const posts = await Article.find({ published: true }).select('title body authorLabel broadcast createdAt').sort({ createdAt: -1 }).limit(30).lean();
  const ids = posts.map(p => p._id);
  const [likes, comments] = await Promise.all([
    Reaction.aggregate([{ $match: { article: { $in: ids } } }, { $group: { _id: '$article', count: { $sum: 1 } } }]),
    Comment.aggregate([{ $match: { article: { $in: ids }, status: 'approved' } }, { $group: { _id: '$article', count: { $sum: 1 } } }])
  ]);
  const counts = (rows: { _id: unknown; count: number }[], id: unknown) => rows.find(row => String(row._id) === String(id))?.count || 0;
  res.json({ posts: posts.map(post => ({ ...post, likes: counts(likes, post._id), comments: counts(comments, post._id) })) });
}));
app.get('/api/community/liked', auth, wrap(async (req: AuthReq, res) => {
  const { ids } = z.object({ ids: z.string().max(750) }).parse(req.query);
  const requested = ids ? ids.split(',') : [];
  if (requested.length > 30 || requested.some(id => !validId(id))) return res.status(400).json({ error: 'Invalid post IDs.' });
  const likes = await Reaction.find({ user: req.account!.id, article: { $in: requested } }).select('article').limit(30).lean();
  res.json({ likes: likes.map(like => like.article) });
}));
app.get('/api/community/saved', auth, wrap(async (req: AuthReq, res) => {
  const { ids } = z.object({ ids: z.string().max(750) }).parse(req.query);
  const requested = ids ? ids.split(',') : [];
  if (requested.length > 30 || requested.some(id => !validId(id))) return res.status(400).json({ error: 'Invalid post IDs.' });
  const items = await Bookmark.find({ user: req.account!.id, article: { $in: requested } }).select('article').limit(30).lean();
  res.json({ saved: items.map(item => item.article) });
}));
app.get('/api/community/:id', idOr404, wrap(async (req, res) => {
  const post = await Article.findOne({ _id: req.params.id, published: true }).select('title body authorLabel broadcast createdAt').lean();
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const [likes, comments] = await Promise.all([Reaction.countDocuments({ article: post._id }), Comment.countDocuments({ article: post._id, status: 'approved' })]);
  res.json({ post: { ...post, likes, comments } });
}));
app.get('/api/my/community', auth, wrap(async (req: AuthReq, res) => {
  const [likes, posts, comments] = await Promise.all([
    Reaction.find({ user: req.account!.id }).select('article').limit(200).lean(),
    Article.find({ submittedBy: req.account!.id }).select('title published createdAt').sort({ createdAt: -1 }).limit(50).lean(),
    Comment.find({ user: req.account!.id }).select('article text status createdAt').populate('article', 'title published').sort({ createdAt: -1 }).limit(50).lean()
  ]);
  res.json({ likes: likes.map(like => like.article), posts, comments });
}));
app.post('/api/community/posts', auth, communityLimiter, wrap(async (req: AuthReq, res) => {
  const data = z.object({ title: text(2,120), body: text(2,10000), showName: z.boolean() }).parse(req.body);
  const post = await Article.create({ title: data.title, body: data.body, published: false, submittedBy: req.account!.id, authorLabel: data.showName ? req.account!.name : 'Community member' });
  await bestEffort(()=>app.locals.notifyRoles(['admin'],'A community reflection is awaiting review.','Content'));
  res.status(201).json({ id: post.id, status: 'pending' });
}));
app.delete('/api/my/community/posts/:id', auth, idOr404, wrap(async (req: AuthReq, res) => {
  const post = await Article.findOneAndDelete({ _id: req.params.id, submittedBy: req.account!.id, published: false });
  if (!post) return res.status(404).json({ error: 'Pending post not found.' });
  await Promise.all([Reaction.deleteMany({ article: req.params.id }), Comment.deleteMany({ article: req.params.id }), Bookmark.deleteMany({ article: req.params.id }), Report.deleteMany({ article: req.params.id })]);
  res.json({ ok: true });
}));
app.get('/api/community/:id/comments', idOr404, wrap(async (req, res) => {
  if (!await Article.exists({ _id: req.params.id, published: true })) return res.status(404).json({ error: 'Post not found.' });
  const comments = await Comment.find({ article: req.params.id, status: 'approved' }).select('displayName text createdAt').sort({ createdAt: 1 }).limit(50).lean();
  res.json({ comments });
}));
app.post('/api/community/:id/comments', auth, communityLimiter, idOr404, wrap(async (req: AuthReq, res) => {
  const data = z.object({ text: text(2,1000), showName: z.boolean() }).parse(req.body);
  if (!await Article.exists({ _id: req.params.id, published: true })) return res.status(404).json({ error: 'Post not found.' });
  await Comment.create({ article: req.params.id, user: req.account!.id, displayName: data.showName ? req.account!.name : 'Community member', text: data.text, status: 'pending' });
  await bestEffort(()=>app.locals.notifyRoles(['admin','moderator'],'A community comment is awaiting review.','Moderation'));
  res.status(201).json({ status: 'pending' });
}));
app.delete('/api/my/community/comments/:id', auth, idOr404, wrap(async (req: AuthReq, res) => {
  const deleted = await Comment.deleteOne({ _id: req.params.id, user: req.account!.id });
  if (!deleted.deletedCount) return res.status(404).json({ error: 'Comment not found.' });
  res.json({ ok: true });
}));
app.put('/api/community/:id/like', auth, communityLimiter, idOr404, wrap(async (req: AuthReq, res) => {
  if (!await Article.exists({ _id: req.params.id, published: true })) return res.status(404).json({ error: 'Post not found.' });
  try { await Reaction.updateOne({ article: req.params.id, user: req.account!.id }, { $setOnInsert: { article: req.params.id, user: req.account!.id } }, { upsert: true }); } catch (e: any) { if (e.code !== 11000) throw e; }
  res.json({ liked: true, count: await Reaction.countDocuments({ article: req.params.id }) });
}));
app.delete('/api/community/:id/like', auth, communityLimiter, idOr404, wrap(async (req: AuthReq, res) => {
  if (!await Article.exists({ _id: req.params.id, published: true })) return res.status(404).json({ error: 'Post not found.' });
  await Reaction.deleteOne({ article: req.params.id, user: req.account!.id });
  res.json({ liked: false, count: await Reaction.countDocuments({ article: req.params.id }) });
}));
app.get('/api/my/saved', auth, wrap(async (req: AuthReq, res) => {
  const items = await Bookmark.find({ user: req.account!.id }).populate({ path: 'article', match: { published: true }, select: 'title body authorLabel createdAt' }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items: items.filter(item => item.article) });
}));
app.put('/api/community/:id/save', auth, communityLimiter, idOr404, wrap(async (req: AuthReq, res) => {
  if (!await Article.exists({ _id: req.params.id, published: true })) return res.status(404).json({ error: 'Post not found.' });
  try { await Bookmark.updateOne({ article: req.params.id, user: req.account!.id }, { $setOnInsert: { article: req.params.id, user: req.account!.id } }, { upsert: true }); } catch (e: any) { if (e.code !== 11000) throw e; }
  res.json({ saved: true });
}));
app.delete('/api/community/:id/save', auth, communityLimiter, idOr404, wrap(async (req: AuthReq, res) => { await Bookmark.deleteOne({ article: req.params.id, user: req.account!.id }); res.json({ saved: false }); }));
app.post('/api/community/:id/report', auth, communityLimiter, idOr404, wrap(async (req: AuthReq, res) => {
  const { reason } = z.object({ reason: z.enum(['harassment','safety','spam','other']) }).parse(req.body);
  if (!await Article.exists({ _id: req.params.id, published: true })) return res.status(404).json({ error: 'Post not found.' });
  try { await Report.create({ article: req.params.id, user: req.account!.id, reason, status: 'open' }); await bestEffort(()=>app.locals.notifyRoles(['admin','moderator'],'A community post was reported.','Post reports')); return res.status(201).json({ ok: true }); }
  catch(e: any) { if (e.code === 11000) return res.status(409).json({ error: 'You have already reported this post.' }); throw e; }
}));
app.get('/api/admin/reports', auth, moderationAccess, wrap(async (_req, res) => res.json({ reports: await Report.find().populate('article','title published').populate('user','name email').sort({ createdAt: -1 }).limit(200).lean() })));
app.patch('/api/admin/reports/:id', auth, moderationAccess, idOr404, wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['open','resolved']) }).parse(req.body);
  const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true }); if (!report) return res.status(404).json({ error: 'Report not found.' }); res.json({ ok: true });
}));
app.get('/api/admin/comments', auth, moderationAccess, wrap(async (_req, res) => res.json({ comments: await Comment.find().populate('article','title published').populate('user','name email').sort({ createdAt: -1 }).limit(200).lean() })));
app.patch('/api/admin/comments/:id', auth, moderationAccess, idOr404, wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['pending','approved','rejected']) }).parse(req.body);
  const comment = await Comment.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  if (comment.user) await bestEffort(()=>app.locals.notifyUser(String(comment.user),'Your comment review status has changed.','My activity'));
  res.json({ ok: true });
}));
app.delete('/api/admin/comments/:id', auth, moderationAccess, idOr404, wrap(async (req, res) => {
  const comment = await Comment.findByIdAndDelete(req.params.id); if (!comment) return res.status(404).json({ error: 'Comment not found.' }); res.json({ ok: true });
}));
app.post('/api/contact', rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false }), wrap(async (req, res) => { const data = z.object({ name: text(2,100), email, message: text(10,2000), category: z.enum(['general','ministry','volunteer','visitor']).optional(), interest: z.string().trim().max(100).optional() }).parse(req.body); await Message.create(data); await bestEffort(()=>app.locals.notifyRoles(['admin'],'A new contact message was received.','Messages')); res.status(201).json({ ok: true }); }));
app.post('/api/events/:id/register', auth, idOr404, wrap(async (req: AuthReq, res) => { const event = await Event.findOne({ _id: req.params.id, published: true, date: { $gte: new Date() } }); if (!event) return res.status(404).json({ error: 'Upcoming event not found.' }); try { await Registration.create({ event: event.id, user: req.account!.id }); return res.status(201).json({ ok: true }); } catch(e: any) { if(e.code === 11000) return res.status(409).json({ error: 'You are already registered.' }); throw e; } }));
// Account ownership is taken exclusively from the verified session.
app.get('/api/my/membership', auth, wrap(async (req: AuthReq, res) => {
  const membership = await Membership.findOne({ user: req.account!.id }).select('status createdAt updatedAt').lean();
  res.json({ membership });
}));
app.post('/api/my/membership', auth, wrap(async (req: AuthReq, res) => {
  try {
    const membership = await Membership.findOneAndUpdate({ user: req.account!.id, status: { $in: ['pending','declined'] } }, { $set: { status: 'pending' }, $setOnInsert: { user: req.account!.id } }, { upsert: true, new: true, runValidators: true }).select('status createdAt updatedAt');
    return res.json({ membership });
  } catch (e: any) { if (e.code === 11000) return res.status(409).json({ error: 'Membership is already approved.' }); throw e; }
}));
app.get('/api/admin/memberships', auth, admin, wrap(async (_req, res) => res.json({ memberships: await Membership.find().populate('user','name email active').sort({ updatedAt: -1 }).limit(200).lean() })));
app.patch('/api/admin/memberships/:id', auth, admin, idOr404, wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['approved','declined']) }).parse(req.body);
  const membership = await Membership.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { status }, { new: true, runValidators: true });
  if (!membership) return res.status(404).json({ error: 'Pending membership request not found.' });
  if (membership.user) await bestEffort(()=>app.locals.notifyUser(String(membership.user),'Your membership request has been reviewed.','Membership'));
  res.json({ ok: true });
}));
app.get('/api/my/progress', auth, wrap(async (req: AuthReq, res) => {
  const progress = await Progress.find({ user: req.account!.id }).populate({ path: 'resource', match: { published: true }, select: 'title kind description' }).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ progress: progress.filter(item => item.resource) });
}));
app.put('/api/my/progress/:id', auth, idOr404, wrap(async (req: AuthReq, res) => {
  if (!await Resource.exists({ _id: req.params.id, published: true })) return res.status(404).json({ error: 'Published resource not found.' });
  try { await Progress.updateOne({ user: req.account!.id, resource: req.params.id }, { $setOnInsert: { user: req.account!.id, resource: req.params.id } }, { upsert: true }); }
  catch (e: any) { if (e.code !== 11000) throw e; }
  res.json({ completed: true });
}));
app.delete('/api/my/progress/:id', auth, idOr404, wrap(async (req: AuthReq, res) => {
  await Progress.deleteOne({ user: req.account!.id, resource: req.params.id }); res.json({ completed: false });
}));
app.get('/api/admin/inventory', auth, admin, wrap(async (_req, res) => res.json({ items: await Inventory.find().sort({ name: 1 }).limit(200).lean() })));
app.post('/api/admin/inventory', auth, admin, wrap(async (req, res) => res.status(201).json({ item: await Inventory.create(inventorySchema.parse(req.body)) })));
app.put('/api/admin/inventory/:id', auth, admin, idOr404, wrap(async (req, res) => { const item = await Inventory.findByIdAndUpdate(req.params.id, inventorySchema.parse(req.body), { new: true, runValidators: true }); if (!item) return res.status(404).json({ error: 'Resource not found.' }); res.json({ item }); }));
app.delete('/api/admin/inventory/:id', auth, admin, idOr404, wrap(async (req, res) => { const item = await Inventory.findByIdAndDelete(req.params.id); if (!item) return res.status(404).json({ error: 'Resource not found.' }); res.json({ ok: true }); }));
app.get('/api/broadcasts', wrap(async (_req, res) => res.json({ broadcasts: await Broadcast.find({ published: true }).select('title description url status scheduledAt createdAt').sort({ createdAt: -1 }).limit(100).lean() })));
app.get('/api/broadcasts/:id', idOr404, wrap(async (req, res) => { const broadcast = await Broadcast.findOne({ _id: req.params.id, published: true }).select('title description url status scheduledAt createdAt').lean(); if (!broadcast) return res.status(404).json({ error: 'Broadcast not found.' }); res.json({ broadcast }); }));
app.get('/api/admin/broadcasts', auth, admin, wrap(async (_req, res) => res.json({ broadcasts: await Broadcast.find().sort({ createdAt: -1 }).limit(200).lean() })));
app.post('/api/admin/broadcasts', auth, admin, wrap(async (req, res) => { const data = broadcastSchema.parse(req.body); res.status(201).json({ broadcast: await Broadcast.create({ ...data, scheduledAt: data.scheduledAt || null }) }); }));
app.put('/api/admin/broadcasts/:id', auth, admin, idOr404, wrap(async (req, res) => { const data = broadcastSchema.parse(req.body); const broadcast = await Broadcast.findByIdAndUpdate(req.params.id, { ...data, scheduledAt: data.scheduledAt || null }, { new: true, runValidators: true }); if (!broadcast) return res.status(404).json({ error: 'Broadcast not found.' }); res.json({ broadcast }); }));
app.delete('/api/admin/broadcasts/:id', auth, admin, idOr404, wrap(async (req, res) => { const broadcast = await Broadcast.findByIdAndDelete(req.params.id); if (!broadcast) return res.status(404).json({ error: 'Broadcast not found.' }); res.json({ ok: true }); }));
app.post('/api/admin/broadcasts/:id/share', auth, admin, idOr404, wrap(async (req, res) => {
  const broadcast = await Broadcast.findOne({ _id: req.params.id, published: true });
  if (!broadcast) return res.status(404).json({ error: 'Publish the broadcast before sharing it.' });
  const article = await Article.create({ title: broadcast.title, body: broadcast.description, broadcast: broadcast.id, authorLabel: 'Ministry team', published: true });
  res.status(201).json({ id: article.id });
}));
app.get('/api/my/overview', auth, wrap(async (req: AuthReq, res) => {
  const [registrations, upcoming] = await Promise.all([
    Registration.countDocuments({ user: req.account!.id }),
    Event.find({ published: true, date: { $gte: new Date() } }).sort({ date: 1 }).limit(3).select('title date location').lean()
  ]);
  res.json({ registrations, upcoming });
}));
app.get('/api/my/registrations', auth, wrap(async (req: AuthReq, res) => res.json({ registrations: await Registration.find({ user: req.account!.id }).populate('event', 'title date location published').sort({ createdAt: -1 }).lean() })));
app.delete('/api/my/registrations/:id', auth, idOr404, wrap(async (req: AuthReq, res) => { const result = await Registration.deleteOne({ _id: req.params.id, user: req.account!.id }); if (!result.deletedCount) return res.status(404).json({ error: 'Registration not found.' }); res.json({ ok: true }); }));
// Money is recorded in integer cents. No bank integration or physical money is handled.
const ledgerSchema = z.object({
  kind: z.enum(['income','expense']),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/, 'Enter an amount in KES with at most two decimal places.'),
  category: text(2,60), description: text(2,200),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v+'T00:00:00.000Z'); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === v && v >= '2000-01-01' && v <= '2100-12-31'; }, 'Enter a valid date.'),
  requestKey: z.string().uuid(), currentPassword
}).strict();
function cents(value:string) { const [whole, fractional=''] = value.split('.'); return Number(whole)*100 + Number(fractional.padEnd(2,'0')); }
// MongoDB decimal sums are exact. Convert an integral decimal, including scientific notation, to BigInt.
function decimalInteger(value: unknown): bigint {
  const str=String(value); const m=/^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(str);
  if (!m) throw new Error('Invalid ledger total');
  let digits=m[1]+(m[2]||''); const shift=Number(m[3]||0)-(m[2]||'').length;
  if (shift >= 0) digits+='0'.repeat(shift);
  else { const removed=digits.slice(shift); if (!/^0*$/.test(removed) || -shift > digits.length) throw new Error('Non-integral ledger total'); digits=digits.slice(0,shift)||'0'; }
  return BigInt(digits);
}
app.get('/api/admin/ledger', auth, financeAccess, wrap(async (req,res) => {
  const { before } = z.object({before:z.string().regex(/^[a-fA-F0-9]{24}$/).optional()}).strict().parse(req.query);
  const filter = before ? { _id: { $lt: new mongoose.Types.ObjectId(before) } } : {};
  const [rows, totals] = await Promise.all([
    LedgerEntry.find(filter).select('-requestKey').sort({_id:-1}).limit(51).lean(),
    LedgerEntry.aggregate([{ $match: { status:'posted' } }, { $group: { _id:'$kind', total: { $sum: { $toDecimal: '$amountMinor' } } } }])
  ]);
  const income=decimalInteger(totals.find(t=>t._id==='income')?.total || 0), expense=decimalInteger(totals.find(t=>t._id==='expense')?.total || 0);
  const entries=rows.slice(0,50);
  res.json({entries, nextCursor:rows.length>50?String(entries[entries.length-1]._id):null, totals:{income:income.toString(),expense:expense.toString(),net:(income-expense).toString()}});
}));
app.post('/api/admin/ledger', auth, financeAccess, sensitiveLimiter, wrap(async (req:AuthReq,res) => {
  const data=ledgerSchema.parse(req.body); const amountMinor=cents(data.amount);
  if (amountMinor < 1 || amountMinor > 10000000000) return res.status(400).json({error:'Amount must be between KES 0.01 and KES 100,000,000.00.'});
  if (!await verifyPassword(req,data.currentPassword,['admin','finance'])) return res.status(403).json({error:'Your password is incorrect.'});
  // Idempotency is only safe when the unique index actually exists; fail closed otherwise.
  try {
    const indexes = await LedgerEntry.collection.listIndexes().toArray();
    if (!indexes.some(i => i.unique === true && !i.sparse && !i.partialFilterExpression && i.key?.createdBy === 1 && i.key?.requestKey === 1 && Object.keys(i.key).length === 2)) return res.status(503).json({error:'Ledger index is not ready. Contact an administrator.'});
  } catch { return res.status(503).json({error:'Ledger index is not ready. Contact an administrator.'}); }
  const entry={kind:data.kind,amountMinor,category:data.category,description:data.description,occurredOn:data.occurredOn,requestKey:data.requestKey,createdBy:req.account!.id};
  try { const created=await LedgerEntry.create(entry); return res.status(201).json({id:created.id}); }
  catch(e:any) { if(e.code!==11000) throw e; const existing=await LedgerEntry.findOne({createdBy:req.account!.id,requestKey:data.requestKey}).lean();
    if(!existing || existing.kind!==entry.kind || existing.amountMinor!==entry.amountMinor || existing.category!==entry.category || existing.description!==entry.description || existing.occurredOn!==entry.occurredOn) return res.status(409).json({error:'This submission key was already used for different details.'});
    return res.status(200).json({id:existing._id,duplicate:true}); }
}));
app.post('/api/admin/ledger/:id/void', auth, financeAccess, sensitiveLimiter, idOr404, wrap(async (req:AuthReq,res) => {
  const data=z.object({reason:text(2,200),currentPassword}).strict().parse(req.body);
  if(!await verifyPassword(req,data.currentPassword,['admin','finance'])) return res.status(403).json({error:'Your password is incorrect.'});
  const entry=await LedgerEntry.findOneAndUpdate({_id:req.params.id,status:'posted'},{$set:{status:'void',voidedBy:req.account!.id,voidedAt:new Date(),voidReason:data.reason}},{new:true,runValidators:true});
  if(!entry) return res.status(409).json({error:'Entry is unavailable or already voided.'});
  return res.json({ok:true});
}));
app.post('/api/admin/members/:id/revoke-sessions', auth, admin, sensitiveLimiter, idOr404, wrap(async (req:AuthReq,res) => {
  const {currentPassword:passwordInput}=z.object({currentPassword}).strict().parse(req.body);
  if(!await verifyAdminPassword(req,passwordInput)) return res.status(403).json({error:'Administrator password is incorrect.'});
  const member=await User.findOneAndUpdate({_id:req.params.id,role:{$in:managedRoles}},{$inc:{sessionVersion:1}},{new:true}).select('name email role active');
  if(!member) return res.status(404).json({error:'Account not found or cannot be changed.'});
  await bestEffort(()=>app.locals.signalNotification(req.params.id));
  return res.json({ok:true});
}));
// Only administrators may assign non-admin roles; the target must never be an admin.
app.patch('/api/admin/members/:id/role', auth, admin, sensitiveLimiter, idOr404, wrap(async (req:AuthReq,res) => {
  const {role,currentPassword:passwordInput}=z.object({role:z.enum(managedRoles),currentPassword}).strict().parse(req.body);
  if(!await verifyAdminPassword(req,passwordInput)) return res.status(403).json({error:'Administrator password is incorrect.'});
  const member=await User.findOneAndUpdate({_id:req.params.id,role:{$in:managedRoles}},{$set:{role},$inc:{sessionVersion:1}},{new:true,runValidators:true}).select('name email role active');
  if(!member) return res.status(404).json({error:'Account not found or cannot be changed.'});
  await bestEffort(()=>app.locals.signalNotification(req.params.id));
  return res.json({member});
}));
app.get('/api/admin/overview', auth, admin, wrap(async (_req, res) => {
  const [members, upcomingEvents, unreadMessages, registrations, draftArticles] = await Promise.all([
    User.countDocuments({ role: { $in: managedRoles } }),
    Event.countDocuments({ published: true, date: { $gte: new Date() } }),
    Message.countDocuments({ status: 'new' }),
    Registration.countDocuments(),
    Article.countDocuments({ published: false })
  ]);
  res.json({ members, upcomingEvents, unreadMessages, registrations, draftArticles });
}));
app.get('/api/admin/events', auth, admin, wrap(async (_req, res) => res.json({ events: await Event.find().sort({ date: -1 }).limit(200).lean() })));
app.post('/api/admin/events', auth, admin, wrap(async (req, res) => { const data = eventSchema.parse(req.body); res.status(201).json({ event: await Event.create(data) }); }));
app.put('/api/admin/events/:id', auth, admin, idOr404, wrap(async (req, res) => { const data = eventSchema.parse(req.body); const event = await Event.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }); if (!event) return res.status(404).json({ error: 'Event not found.' }); res.json({ event }); }));
app.delete('/api/admin/events/:id', auth, admin, idOr404, wrap(async (req, res) => { const deleted = await Event.findByIdAndDelete(req.params.id); if (!deleted) return res.status(404).json({ error: 'Event not found.' }); await Registration.deleteMany({ event: req.params.id }); res.json({ ok: true }); }));
app.get('/api/admin/resources', auth, admin, wrap(async (_req, res) => res.json({ resources: await Resource.find().sort({ createdAt: -1 }).limit(200).lean() })));
app.post('/api/admin/resources', auth, admin, wrap(async (req, res) => res.status(201).json({ resource: await Resource.create(resourceSchema.parse(req.body)) })));
app.put('/api/admin/resources/:id', auth, admin, idOr404, wrap(async (req, res) => { const item = await Resource.findByIdAndUpdate(req.params.id, resourceSchema.parse(req.body), { new: true, runValidators: true }); if (!item) return res.status(404).json({ error: 'Resource not found.' }); res.json({ resource: item }); }));
app.delete('/api/admin/resources/:id', auth, admin, idOr404, wrap(async (req, res) => { const item = await Resource.findByIdAndDelete(req.params.id); if (!item) return res.status(404).json({ error: 'Resource not found.' }); await Progress.deleteMany({ resource: req.params.id }); res.json({ ok: true }); }));
app.get('/api/admin/articles', auth, admin, wrap(async (_req, res) => res.json({ articles: await Article.find().sort({ createdAt: -1 }).limit(100).lean() })));
app.post('/api/admin/articles', auth, admin, wrap(async (req, res) => res.status(201).json({ article: await Article.create(articleSchema.parse(req.body)) })));
app.put('/api/admin/articles/:id', auth, admin, idOr404, wrap(async (req, res) => { const article = await Article.findByIdAndUpdate(req.params.id, articleSchema.parse(req.body), { new: true, runValidators: true }); if (!article) return res.status(404).json({ error: 'Article not found.' }); if (article.submittedBy && article.published) await bestEffort(()=>app.locals.notifyUser(String(article.submittedBy),'Your published reflection was updated.','My activity')); res.json({ article }); }));
app.delete('/api/admin/articles/:id', auth, admin, idOr404, wrap(async (req, res) => { const item = await Article.findByIdAndDelete(req.params.id); if (!item) return res.status(404).json({ error: 'Article not found.' }); await Promise.all([Reaction.deleteMany({ article: req.params.id }), Comment.deleteMany({ article: req.params.id }), Bookmark.deleteMany({ article: req.params.id }), Report.deleteMany({ article: req.params.id })]); res.json({ ok: true }); }));
app.get('/api/admin/members', auth, admin, wrap(async (_req, res) => res.json({ members: await User.find().select('name email role active createdAt').sort({ createdAt: -1 }).limit(200).lean() })));
app.get('/api/admin/members/:id', auth, admin, idOr404, wrap(async (req, res) => { const member = await User.findById(req.params.id).select('name email role active createdAt bio avatar').lean(); if (!member) return res.status(404).json({ error: 'Member not found.' }); res.json({ member }); }));
app.patch('/api/admin/members/:id/status', auth, admin, sensitiveLimiter, idOr404, wrap(async (req: AuthReq, res) => {
  const { active, currentPassword: passwordInput } = z.object({ active: z.boolean(), currentPassword }).strict().parse(req.body);
  if (!await verifyAdminPassword(req,passwordInput)) return res.status(403).json({error:'Administrator password is incorrect.'});
  const member = await User.findOneAndUpdate({ _id: req.params.id, role: { $in: managedRoles } }, { $set: { active }, $inc: { sessionVersion: 1 } }, { new: true }).select('name email role active');
  if (!member) return res.status(404).json({ error: 'Account not found or cannot be changed.' });
  await bestEffort(()=>app.locals.signalNotification(req.params.id));
  res.json({ member });
}));
app.get('/api/admin/messages', auth, admin, wrap(async (_req, res) => res.json({ messages: await Message.find().sort({ createdAt: -1 }).limit(200).lean() })));
app.patch('/api/admin/messages/:id', auth, admin, idOr404, wrap(async (req, res) => { const { status } = z.object({ status: z.enum(['new','read']) }).parse(req.body); const item = await Message.findByIdAndUpdate(req.params.id, { status }, { new: true }); if (!item) return res.status(404).json({ error: 'Message not found.' }); res.json({ message: item }); }));
app.get('/api/admin/registrations', auth, admin, wrap(async (_req, res) => res.json({ registrations: await Registration.find().populate('event', 'title date').populate('user', 'name email').sort({ createdAt: -1 }).limit(200).lean() })));
// Old public project PDF links must not be served or fall through to static files.
app.use((req, res, next) => {
  try { if (/^\/documents\/.+/i.test(decodeURIComponent(req.path))) return res.status(404).json({ error: 'Not found.' }); }
  catch { return res.status(400).json({ error: 'Invalid path.' }); }
  next();
});
// Optional single-origin deployment. Only the explicitly configured build directory is served.
if (process.env.WEB_DIST) {
  const webDist = path.resolve(process.env.WEB_DIST);
  if (containsPath(webDist, sourceDocs) || (process.env.PRIVATE_DOCS_DIR && containsPath(webDist, process.env.PRIVATE_DOCS_DIR)) || fs.existsSync(path.join(webDist, 'documents'))) throw new Error('WEB_DIST must not contain confidential project documents or an old public documents folder.');
  app.use(publicSite(webDist));
}
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => { if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input.' }); if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' }); if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' }); console.error(JSON.stringify({ level:'error', event:'request_error', requestId:res.locals.requestId, errorType:err?.name || 'Error' })); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });
export default app;
