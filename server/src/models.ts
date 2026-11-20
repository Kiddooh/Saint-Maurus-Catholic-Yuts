import mongoose, { Schema } from 'mongoose';
const user = new Schema({ name: { type: String, required: true, trim: true, maxlength: 100 }, email: { type: String, required: true, lowercase: true, trim: true, unique: true }, passwordHash: { type: String, required: true, select: false }, role: { type: String, enum: ['member', 'finance', 'moderator', 'admin'], default: 'member' }, active: { type: Boolean, default: true }, sessionVersion: { type: Number, default: 0 }, bio: { type: String, default: '', maxlength: 500 }, avatar: { type: String, default: '' } }, { timestamps: true });
const event = new Schema({ title: { type: String, required: true, maxlength: 120 }, description: { type: String, required: true, maxlength: 2000 }, date: { type: Date, required: true }, location: { type: String, required: true, maxlength: 160 }, published: { type: Boolean, default: false } }, { timestamps: true });
event.index({ published: 1, date: 1 });
event.index({ published: 1, title: 'text', description: 'text' });
const registration = new Schema({ event: { type: Schema.Types.ObjectId, ref: 'Event', required: true }, user: { type: Schema.Types.ObjectId, ref: 'User', required: true } }, { timestamps: true });
registration.index({ event: 1, user: 1 }, { unique: true });
const message = new Schema({ category: { type: String, enum: ['general', 'ministry', 'volunteer', 'visitor'], default: 'general' }, interest: { type: String, default: '', maxlength: 100 }, name: { type: String, required: true }, email: { type: String, required: true }, message: { type: String, required: true }, status: { type: String, enum: ['new', 'read'], default: 'new' } }, { timestamps: true });
const article = new Schema({ broadcast: { type: Schema.Types.ObjectId, ref: 'Broadcast', default: null }, submittedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }, authorLabel: { type: String, default: 'Ministry team', maxlength: 100 }, title: { type: String, required: true, maxlength: 120 }, body: { type: String, required: true, maxlength: 10000 }, published: { type: Boolean, default: false } }, { timestamps: true });
const resource = new Schema({ placements: { type: [{ type: String, enum: ['library','resources','meditations'] }], default: undefined }, kind: { type: String, enum: ['sermon', 'teaching', 'library', 'music', 'bible', 'meditation'], required: true }, title: { type: String, required: true, maxlength: 120 }, description: { type: String, required: true, maxlength: 2000 }, body: { type: String, default: '', maxlength: 10000 }, url: { type: String, default: '', maxlength: 2048 }, published: { type: Boolean, default: false } }, { timestamps: true });
resource.index({ published: 1, kind: 1, createdAt: -1 });
resource.index({ published: 1, title: 'text', description: 'text', body: 'text' });
const membership = new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, status: { type: String, enum: ['pending','approved','declined'], default: 'pending' } }, { timestamps: true });
membership.index({ status: 1, createdAt: -1 });
const progress = new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, resource: { type: Schema.Types.ObjectId, ref: 'Resource', required: true } }, { timestamps: true });
progress.index({ user: 1, resource: 1 }, { unique: true });
const inventory = new Schema({ name: { type: String, required: true, maxlength: 120 }, category: { type: String, required: true, maxlength: 80 }, quantity: { type: Number, required: true, min: 0, max: 1000000 }, location: { type: String, required: true, maxlength: 120 }, notes: { type: String, default: '', maxlength: 1000 } }, { timestamps: true });
const broadcast = new Schema({ title: { type: String, required: true, maxlength: 120 }, description: { type: String, required: true, maxlength: 2000 }, url: { type: String, required: true, maxlength: 2048 }, status: { type: String, enum: ['scheduled','live','recorded'], required: true }, scheduledAt: { type: Date, default: null }, published: { type: Boolean, default: false } }, { timestamps: true });
broadcast.index({ published: 1, createdAt: -1 });
broadcast.index({ published: 1, title: 'text', description: 'text' });
article.index({ published: 1, createdAt: -1 });
article.index({ published: 1, title: 'text', body: 'text' });
// Integer cents, no editable/deletable financial records. A void updates the same record atomically.
const ledgerEntry = new Schema({
  kind: { type: String, enum: ['income','expense'], required: true, immutable: true },
  amountMinor: { type: Number, required: true, min: 1, max: 10000000000, immutable: true },
  category: { type: String, required: true, maxlength: 60, immutable: true },
  description: { type: String, required: true, maxlength: 200, immutable: true },
  occurredOn: { type: String, required: true, immutable: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  requestKey: { type: String, required: true, immutable: true },
  status: { type: String, enum: ['posted','void'], default: 'posted' },
  voidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  voidedAt: { type: Date, default: null },
  voidReason: { type: String, maxlength: 200, default: '' }
}, { timestamps: true });
ledgerEntry.index({ createdBy: 1, requestKey: 1 }, { unique: true });
ledgerEntry.index({ status: 1, kind: 1 });
const bookmark = new Schema({ article: { type: Schema.Types.ObjectId, ref: 'Article', required: true }, user: { type: Schema.Types.ObjectId, ref: 'User', required: true } }, { timestamps: true });
bookmark.index({ user: 1, article: 1 }, { unique: true });
const report = new Schema({ article: { type: Schema.Types.ObjectId, ref: 'Article', required: true }, user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, reason: { type: String, enum: ['harassment','safety','spam','other'], required: true }, status: { type: String, enum: ['open','resolved'], default: 'open' } }, { timestamps: true });
report.index({ article: 1, user: 1 }, { unique: true });
report.index({ status: 1, createdAt: -1 });
const reaction = new Schema({ article: { type: Schema.Types.ObjectId, ref: 'Article', required: true }, user: { type: Schema.Types.ObjectId, ref: 'User', required: true } }, { timestamps: true });
reaction.index({ article: 1, user: 1 }, { unique: true });
const comment = new Schema({ article: { type: Schema.Types.ObjectId, ref: 'Article', required: true }, user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, displayName: { type: String, required: true, maxlength: 100 }, text: { type: String, required: true, maxlength: 1000 }, status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' } }, { timestamps: true });
comment.index({ article: 1, status: 1, createdAt: 1 });
export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntry);
export const Bookmark = mongoose.model('Bookmark', bookmark);
export const Report = mongoose.model('Report', report);
export const Membership = mongoose.model('Membership', membership);
export const Progress = mongoose.model('Progress', progress);
export const Inventory = mongoose.model('Inventory', inventory);
export const Broadcast = mongoose.model('Broadcast', broadcast);
export const Reaction = mongoose.model('Reaction', reaction);
export const Comment = mongoose.model('Comment', comment);
export const Resource = mongoose.model('Resource', resource);
export const User = mongoose.model('User', user);
export const Event = mongoose.model('Event', event);
export const Registration = mongoose.model('Registration', registration);
export const Message = mongoose.model('Message', message);
export const Article = mongoose.model('Article', article);

const notification = new Schema({
  user: {type:Schema.Types.ObjectId, ref:'User', required:true},
  message: {type:String, required:true, maxlength:160},
  target: {type:String, enum:['Content','Moderation','Post reports','Messages','Membership requests','My activity','Membership'], required:true},
  readAt: {type:Date, default:null}
}, {timestamps:true});
notification.index({user:1,_id:-1});
notification.index({user:1,readAt:1});
notification.index({createdAt:1},{expireAfterSeconds:90*24*60*60});
export const Notification = mongoose.model('Notification',notification);
