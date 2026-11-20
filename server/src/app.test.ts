import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import app from './app.js';
app.locals.notifyRoles = async () => {}; app.locals.notifyUser = async () => {}; app.locals.signalNotification = async () => {};
import { User, Resource, Article, Comment, Reaction, Membership, Progress, Inventory, Broadcast } from './models.js';

const originalFindById = User.findById;
after(() => { User.findById = originalFindById; mongoose.connection.readyState = 0; });

test('health shows missing configuration and API fails closed', async () => {
  delete process.env.JWT_SECRET; mongoose.connection.readyState = 0;
  const health = await request(app).get('/api/health').expect(200);
  assert.equal(health.body.status, 'configuration_required');
  await request(app).get('/api/events').expect(503);
});
test('rejects cross-origin and non-JSON browser mutations', async () => {
  await request(app).post('/api/contact').set('Origin', 'https://evil.example').send({}).expect(403);
  await request(app).post('/api/contact').type('form').send('name=Test').expect(415);
});
test('authentication and admin authorization fail closed', async () => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long'; mongoose.connection.readyState = 1;
  await request(app).get('/api/admin/members').expect(401);
  await request(app).get('/api/admin/overview').expect(401);
  await request(app).get('/api/my/overview').expect(401);
  const id = '507f1f77bcf86cd799439011';
  (User as any).findById = () => ({ select: async () => ({ id, name: 'Member', email: 'member@example.test', role: 'member', sessionVersion: 1 }) });
  const token = jwt.sign({ ver: 1 }, process.env.JWT_SECRET!, { subject: id, algorithm: 'HS256' });
  await request(app).get('/api/auth/me').set('Cookie', `session=${token}`).expect(200);
  await request(app).get('/api/admin/members').set('Cookie', `session=${token}`).expect(403);
  await request(app).get('/api/admin/overview').set('Cookie', `session=${token}`).expect(403);
  await request(app).get('/api/admin/resources').set('Cookie', `session=${token}`).expect(403);
  await request(app).patch('/api/admin/members/507f1f77bcf86cd799439012/status').set('Cookie', `session=${token}`).send({active:false}).expect(403);
  await request(app).patch('/api/auth/me').set('Cookie', `session=${token}`).send({name:'Member',avatar:'data:image/svg+xml;base64,PHN2Zz4='}).expect(400);
  const revoked = jwt.sign({ ver: 0 }, process.env.JWT_SECRET!, { subject: id, algorithm: 'HS256' });
  await request(app).get('/api/auth/me').set('Cookie', `session=${revoked}`).expect(401);
  (User as any).findById = () => ({ select: async () => ({ id, name: 'Member', email: 'member@example.test', role: 'member', sessionVersion: 1, active: false }) });
  await request(app).get('/api/auth/me').set('Cookie', `session=${token}`).expect(401);
});
test('rejects invalid data before database write', async () => {
  const id = '507f1f77bcf86cd799439011';
  (User as any).findById = () => ({ select: async () => ({ id, name: 'Admin', email: 'admin@example.test', role: 'admin', sessionVersion: 1 }) });
  const token = jwt.sign({ ver: 1 }, process.env.JWT_SECRET!, { subject: id, algorithm: 'HS256' });
  await request(app).post('/api/admin/events').set('Cookie', `session=${token}`).send({ title: '', published: true }).expect(400);
  await request(app).post('/api/auth/register').send({ name: 'A user', email: 'a@example.test', password: 'short', adult: true }).expect(400);
  await request(app).post('/api/admin/resources').set('Cookie', `session=${token}`).send({kind:'teaching',title:'Test',description:'A test',body:'',url:'javascript:alert(1)',published:true}).expect(400);
  await request(app).get('/api/events?from=2025-01-01T00:00:00Z&to=2026-01-01T00:00:00Z').expect(400);
});

test('admin resource creation and account suspension enforce intended fields', async () => {
  const id = '507f1f77bcf86cd799439011';
  (User as any).findById = () => ({ select: async () => ({ id, name: 'Admin', email: 'admin@example.test', role: 'admin', sessionVersion: 1, passwordHash: bcrypt.hashSync('a-test-password',4) }) });
  const token = jwt.sign({ ver: 1 }, process.env.JWT_SECRET!, { subject: id, algorithm: 'HS256' });
  const originalCreate = Resource.create; const originalUpdate = User.findOneAndUpdate;
  let created: any; let criteria: any;
  try {
    (Resource as any).create = async (value: any) => { created = value; return value; };
    (User as any).findOneAndUpdate = (query: any) => { criteria = query; return { select: async () => null }; };
    const response = await request(app).post('/api/admin/resources').set('Cookie', `session=${token}`).send({kind:'sermon',title:'Sunday reflection',description:'A reflection',body:'Text',url:'https://example.org/sermon',published:false}).expect(201);
    assert.equal(response.body.resource.kind, 'sermon'); assert.equal(created.published, false);
    await request(app).patch('/api/admin/members/507f1f77bcf86cd799439012/status').set('Cookie', `session=${token}`).send({active:false,currentPassword:'a-test-password'}).expect(404);
    assert.deepEqual(criteria.role.$in, ['member','finance','moderator']);
  } finally { Resource.create = originalCreate; User.findOneAndUpdate = originalUpdate; }
});

test('community submissions and reactions require authentication and comments start pending', async () => {
  const id = '507f1f77bcf86cd799439011'; const postId = '507f1f77bcf86cd799439012';
  (User as any).findById = () => ({ select: async () => ({ id, name: 'Private Name', email: 'member@example.test', role: 'member', sessionVersion: 1 }) });
  const token = jwt.sign({ ver: 1 }, process.env.JWT_SECRET!, { subject: id, algorithm: 'HS256' });
  await request(app).post('/api/community/posts').send({title:'Test',body:'A reflection',showName:false}).expect(401);
  await request(app).get('/api/admin/comments').set('Cookie', `session=${token}`).expect(403);
  const originalArticleCreate = Article.create; const originalExists = Article.exists; const originalCommentCreate = Comment.create; const originalUpdate = Reaction.updateOne; const originalCount = Reaction.countDocuments;
  let submitted: any; let written: any; let reaction: any;
  try {
    (Article as any).create = async (value: any) => { submitted = value; return {id: postId}; };
    (Article as any).exists = async () => ({_id:postId});
    (Comment as any).create = async (value: any) => { written = value; return value; };
    (Reaction as any).updateOne = async (query: any, update: any, options: any) => { reaction = {query,update,options}; return {}; };
    (Reaction as any).countDocuments = async () => 1;
    await request(app).post('/api/community/posts').set('Cookie', `session=${token}`).send({title:'A reflection',body:'Hello community',showName:false}).expect(201);
    assert.equal(submitted.published, false); assert.equal(submitted.authorLabel, 'Community member'); assert.equal(submitted.submittedBy, id);
    await request(app).post(`/api/community/${postId}/comments`).set('Cookie', `session=${token}`).send({text:'Thank you',showName:false}).expect(201);
    assert.equal(written.status, 'pending'); assert.equal(written.displayName, 'Community member');
    const like = await request(app).put(`/api/community/${postId}/like`).set('Cookie', `session=${token}`).send({}).expect(200);
    assert.equal(like.body.count, 1); assert.equal(reaction.options.upsert, true); assert.equal(reaction.query.user, id);
  } finally { Article.create = originalArticleCreate; Article.exists = originalExists; Comment.create = originalCommentCreate; Reaction.updateOne = originalUpdate; Reaction.countDocuments = originalCount; }
});

test('public community feed counts only approved comments and excludes submitter IDs', async () => {
  const id = new mongoose.Types.ObjectId();
  const originalFind = Article.find; const originalLikes = Reaction.aggregate; const originalComments = Comment.aggregate;
  let match: any;
  try {
    (Article as any).find = () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [{_id:id,title:'Welcome',body:'Hello',authorLabel:'Ministry team',createdAt:new Date()}] }) }) }) });
    (Reaction as any).aggregate = async () => [{_id:id,count:3}];
    (Comment as any).aggregate = async (pipeline: any) => { match = pipeline[0].$match; return [{_id:id,count:2}]; };
    const response = await request(app).get('/api/community').expect(200);
    assert.equal(match.status, 'approved'); assert.equal(response.body.posts[0].likes, 3); assert.equal(response.body.posts[0].comments, 2); assert.equal(response.body.posts[0].submittedBy, undefined);
  } finally { Article.find = originalFind; Reaction.aggregate = originalLikes; Comment.aggregate = originalComments; }
});

test('a shared community post must be published', async () => {
  const id = '507f1f77bcf86cd799439012'; const originalFindOne = Article.findOne; const originalLikes = Reaction.countDocuments; const originalComments = Comment.countDocuments; let criteria: any;
  try {
    (Article as any).findOne = (query: any) => { criteria=query; return {select: () => ({lean: async () => null})}; };
    await request(app).get('/api/community/'+id).expect(404); assert.equal(criteria.published, true);
    (Article as any).findOne = () => ({select: () => ({lean: async () => ({_id:id,title:'Welcome',body:'Hello',authorLabel:'Ministry team',createdAt:new Date()})})});
    (Reaction as any).countDocuments = async () => 2;
    (Comment as any).countDocuments = async (query: any) => {assert.equal(query.status,'approved');return 1;};
    const response=await request(app).get('/api/community/'+id).expect(200);
    assert.equal(response.body.post.likes,2); assert.equal(response.body.post.comments,1);
  } finally { Article.findOne=originalFindOne; Reaction.countDocuments=originalLikes; Comment.countDocuments=originalComments; }
});


test('membership, inventory, progress and broadcasting enforce authorization', async () => {
  const id = '507f1f77bcf86cd799439011'; const other = '507f1f77bcf86cd799439012';
  (User as any).findById = () => ({ select: async () => ({ id, name:'Member', email:'member@example.test', role:'member', sessionVersion:1 }) });
  const token = jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:id,algorithm:'HS256'});
  await request(app).get('/api/my/membership').expect(401);
  await request(app).get('/api/my/progress').expect(401);
  await request(app).get('/api/admin/inventory').set('Cookie',`session=${token}`).expect(403);
  await request(app).get('/api/admin/memberships').set('Cookie',`session=${token}`).expect(403);
  await request(app).post('/api/admin/broadcasts/'+other+'/share').set('Cookie',`session=${token}`).send({}).expect(403);
  const find=Resource.exists, update=Progress.updateOne, del=Progress.deleteOne; let query:any;
  try {
    (Resource as any).exists=async(q:any)=>{assert.equal(q.published,true);return null;};
    await request(app).put('/api/my/progress/'+other).set('Cookie',`session=${token}`).send({}).expect(404);
    (Resource as any).exists=async()=>true;
    (Progress as any).updateOne=async(q:any,_u:any,options:any)=>{query=q;assert.equal(options.upsert,true);};
    await request(app).put('/api/my/progress/'+other).set('Cookie',`session=${token}`).send({user:'attacker'}).expect(200);
    assert.equal(query.user,id); assert.equal(query.resource,other);
    (Progress as any).deleteOne=async(q:any)=>{query=q;};
    await request(app).delete('/api/my/progress/'+other).set('Cookie',`session=${token}`).send({}).expect(200);
    assert.equal(query.user,id);
  } finally { Resource.exists=find; Progress.updateOne=update; Progress.deleteOne=del; }
});

test('admin membership decisions, broadcasts and inventory validate inputs', async () => {
  const id='507f1f77bcf86cd799439011', other='507f1f77bcf86cd799439012';
  (User as any).findById=()=>({select:async()=>({id,name:'Admin',email:'admin@example.test',role:'admin',sessionVersion:1})});
  const token=jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:id,algorithm:'HS256'});
  await request(app).post('/api/admin/broadcasts').set('Cookie',`session=${token}`).send({title:'Sermon',description:'A message',url:'javascript:alert(1)',status:'live',scheduledAt:'',published:true}).expect(400);
  await request(app).post('/api/admin/inventory').set('Cookie',`session=${token}`).send({name:'Chairs',category:'Equipment',quantity:-2,location:'Hall',notes:''}).expect(400);
  await request(app).patch('/api/admin/memberships/'+other).set('Cookie',`session=${token}`).send({status:'approved-but-not-really'}).expect(400);
  const oldMembership=Membership.findOneAndUpdate, oldFind=Broadcast.findOne, oldCreate=Article.create; let criteria:any, made:any;
  try{
    (Membership as any).findOneAndUpdate=async(q:any)=>{criteria=q;return null;};
    await request(app).patch('/api/admin/memberships/'+other).set('Cookie',`session=${token}`).send({status:'approved'}).expect(404);
    assert.equal(criteria.status,'pending');
    (Broadcast as any).findOne=async(q:any)=>{criteria=q;return null;};
    await request(app).post('/api/admin/broadcasts/'+other+'/share').set('Cookie',`session=${token}`).send({}).expect(404);
    assert.equal(criteria.published,true);
    (Broadcast as any).findOne=async()=>({id:other,title:'Message',description:'A sermon'});
    (Article as any).create=async(value:any)=>{made=value;return {id:'post-id'};};
    await request(app).post('/api/admin/broadcasts/'+other+'/share').set('Cookie',`session=${token}`).send({}).expect(201);
    assert.equal(made.published,true); assert.equal(made.broadcast,other); assert.equal(made.authorLabel,'Ministry team');
  }finally{Membership.findOneAndUpdate=oldMembership;Broadcast.findOne=oldFind;Article.create=oldCreate;}
});

test('production rejects insecure same-host browser mutation origins', async () => {
  const original=process.env.NODE_ENV;
  try { process.env.NODE_ENV='production'; await request(app).post('/api/contact').set('Host','church.example').set('Origin','http://church.example').send({}).expect(403); }
  finally { process.env.NODE_ENV=original; }
});

test('private project PDF downloads require an admin and are not static assets', async () => {
  const id = '507f1f77bcf86cd799439011';
  const originalNodeEnv=process.env.NODE_ENV, originalDir=process.env.PRIVATE_DOCS_DIR, originalWeb=process.env.WEB_DIST;
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'maurus-private-doc-test-'));
  for (const name of ['client-proposal.pdf','agreement-compliance-milestones.pdf','phase-14-terms-compliance.pdf','phase-15-church-theme.pdf','phase-16-map-themes.pdf']) fs.writeFileSync(path.join(fixture,name),'%PDF-1.4\nTest fixture only\n%%EOF');
  process.env.PRIVATE_DOCS_DIR=fixture; delete process.env.WEB_DIST; process.env.NODE_ENV='test';
  const token=jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:id,algorithm:'HS256'});
  try {
    await request(app).get('/documents/client-proposal.pdf').expect(404);
    await request(app).get('/%64ocuments/client-proposal.pdf').expect(404);
    await request(app).get('/api/admin/documents').expect(401);
    await request(app).get('/api/admin/documents/client-proposal.pdf').expect(401);
    await request(app).get('/api/admin/documents/agreement-compliance-milestones.pdf').expect(401);
    (User as any).findById=()=>({select:async()=>({id,name:'Member',email:'m@example.test',role:'member',sessionVersion:1})});
    await request(app).get('/api/admin/documents').set('Cookie',`session=${token}`).expect(403);
    await request(app).get('/api/admin/documents/client-proposal.pdf').set('Cookie',`session=${token}`).expect(403);
    await request(app).get('/api/admin/documents/agreement-compliance-milestones.pdf').set('Cookie',`session=${token}`).expect(403);
    (User as any).findById=()=>({select:async()=>({id,name:'Admin',email:'a@example.test',role:'admin',sessionVersion:1})});
    const list=await request(app).get('/api/admin/documents').set('Cookie',`session=${token}`).expect(200);
    assert.ok(list.body.documents.some((doc:any)=>doc.file==='client-proposal.pdf'));
    assert.ok(list.body.documents.some((doc:any)=>doc.file==='agreement-compliance-milestones.pdf'));
    assert.ok(list.body.documents.some((doc:any)=>doc.file==='phase-14-terms-compliance.pdf'));
    assert.ok(list.body.documents.some((doc:any)=>doc.file==='phase-15-church-theme.pdf'));
    assert.ok(list.body.documents.some((doc:any)=>doc.file==='phase-16-map-themes.pdf'));
    await request(app).get('/api/admin/documents/phase-16-map-themes.pdf').set('Cookie',`session=${token}`).expect(200);
    await request(app).get('/api/admin/documents/phase-15-church-theme.pdf').set('Cookie',`session=${token}`).expect(200);
    const agreement=await request(app).get('/api/admin/documents/agreement-compliance-milestones.pdf').set('Cookie',`session=${token}`).expect(200);
    assert.match(agreement.headers['content-disposition'],/attachment/);assert.match(agreement.headers['cache-control'],/no-store/);
    const pdf=await request(app).get('/api/admin/documents/client-proposal.pdf').set('Cookie',`session=${token}`).expect(200);
    assert.match(pdf.headers['content-type'],/application\/pdf/);assert.match(pdf.headers['content-disposition'],/^attachment/);assert.match(pdf.headers['cache-control'],/no-store/);
    await request(app).get('/api/admin/documents/client-proposal.md').set('Cookie',`session=${token}`).expect(404);
    await request(app).get('/api/admin/documents/%2e%2e%2fclient-proposal.pdf').set('Cookie',`session=${token}`).expect(404);
    process.env.NODE_ENV='production'; delete process.env.PRIVATE_DOCS_DIR;
    await request(app).get('/api/admin/documents').set('Cookie',`session=${token}`).expect(503);
    process.env.NODE_ENV='test';process.env.PRIVATE_DOCS_DIR=fixture;process.env.WEB_DIST=fixture;
    await request(app).get('/api/admin/documents').set('Cookie',`session=${token}`).expect(503);
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); if(originalNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalNodeEnv;if(originalDir===undefined)delete process.env.PRIVATE_DOCS_DIR;else process.env.PRIVATE_DOCS_DIR=originalDir;if(originalWeb===undefined)delete process.env.WEB_DIST;else process.env.WEB_DIST=originalWeb; }
});

test('resource publication and placements are validated and public reads honor destinations', async () => {
  const id='507f1f77bcf86cd799439011';(User as any).findById=()=>({select:async()=>({id,name:'Admin',email:'a@example.test',role:'admin',sessionVersion:1})});
  const token=jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:id,algorithm:'HS256'});
  const basic={kind:'teaching',title:'A teaching',description:'A reflection',body:'',url:'',published:true};
  await request(app).post('/api/admin/resources').set('Cookie',`session=${token}`).send({...basic,placements:[]}).expect(400);
  await request(app).post('/api/admin/resources').set('Cookie',`session=${token}`).send({...basic,placements:['library','invalid']}).expect(400);
  await request(app).get('/api/resources?placement=invalid').expect(400);
  const originalFind=Resource.find;let filter:any;
  try {
    (Resource as any).find=(query:any)=>{filter=query;return {sort:()=>({limit:()=>({lean:async()=>[]})})};};
    await request(app).get('/api/resources?placement=meditations').expect(200);
    assert.equal(filter.published,true);assert.deepEqual(filter.$or[0],{placements:'meditations'});assert.equal(filter.$or[1].kind,'meditation');
  } finally { Resource.find=originalFind; }
});

test('liveness, readiness and request IDs expose no private details', async () => {
  mongoose.connection.readyState = 0;
  const live = await request(app).get('/health/live').expect(200);
  assert.equal(live.body.status, 'alive'); assert.match(live.headers['x-request-id'], /^[a-f0-9-]{36}$/);
  const ready = await request(app).get('/health/ready').expect(503); assert.equal(ready.headers['cache-control'], 'no-store');
  mongoose.connection.readyState = 1;
});

test('search only queries published content and respects resource destinations', async () => {
  const originals = [Article.find, Resource.find, mongoose.model('Event').find, Broadcast.find]; const Event = mongoose.model('Event');
  const filters: any[] = [];
  const chain = (items:any[]) => ({select:()=>({sort:()=>({limit:()=>({maxTimeMS:()=>({lean:async()=>items})})})})});
  try {
    (Article as any).find = (q:any) => {filters.push(q);return chain([{_id:'507f1f77bcf86cd799439012',title:'Prayer',body:'Reflect'}]);};
    (Resource as any).find = (q:any) => {filters.push(q);return chain([{_id:'507f1f77bcf86cd799439013',title:'Study',description:'Prayer',kind:'teaching',placements:['meditations']}]);};
    (Event as any).find = (q:any) => {filters.push(q);return chain([]);};
    (Broadcast as any).find = (q:any) => {filters.push(q);return chain([]);};
    await request(app).get('/api/search?q=x').expect(400);
    await request(app).get('/api/search?q%5B%24ne%5D=x').expect(400);
    await request(app).get('/api/search?q=%24where').expect(400);
    await request(app).get('/api/search?q=prayer%20%22test%22').expect(400);
    const result = await request(app).get('/api/search?q=prayer').expect(200);
    assert.equal(result.headers['cache-control'],'no-store'); assert.equal(result.body.results.length,2);
    assert.equal(result.body.results[1].url,'/meditations?resource=507f1f77bcf86cd799439013');
    assert.ok(filters.every(f=>f.published===true && f.$text.$search==='prayer'));
    assert.ok(filters[1].$or);
  } finally { Article.find=originals[0] as typeof Article.find; Resource.find=originals[1] as typeof Resource.find; Event.find=originals[2]; Broadcast.find=originals[3] as typeof Broadcast.find; }
});

test('saving and reporting require a user, use ownership, and restrict moderation to admins', async () => {
  const {Bookmark, Report} = await import('./models.js'); const userId='507f1f77bcf86cd799439011';const postId='507f1f77bcf86cd799439012';
  (User as any).findById = () => ({select:async()=>({id:userId,name:'Member',email:'member@example.test',role:'member',sessionVersion:1})});
  const token=jwt.sign({ver:1},process.env.JWT_SECRET!,{subject:userId,algorithm:'HS256'}); const cookie=`session=${token}`;
  await request(app).put(`/api/community/${postId}/save`).send({}).expect(401);
  await request(app).post(`/api/community/${postId}/report`).send({reason:'spam'}).expect(401);
  await request(app).get('/api/admin/reports').set('Cookie',cookie).expect(403);
  const exists=Article.exists, update=Bookmark.updateOne, remove=Bookmark.deleteOne, create=Report.create;let saved:any, deleted:any, reported:any;
  try {
    (Article as any).exists=async(q:any)=>q.published===true;
    (Bookmark as any).updateOne=async(q:any,_u:any,opts:any)=>{saved={q,opts};};
    (Bookmark as any).deleteOne=async(q:any)=>{deleted=q;};
    (Report as any).create=async(v:any)=>{reported=v;};
    await request(app).put(`/api/community/${postId}/save`).set('Cookie',cookie).send({}).expect(200);
    assert.equal(saved.q.user,userId); assert.equal(saved.opts.upsert,true);
    await request(app).delete(`/api/community/${postId}/save`).set('Cookie',cookie).send({}).expect(200); assert.equal(deleted.user,userId);
    await request(app).post(`/api/community/${postId}/report`).set('Cookie',cookie).send({reason:'wrong'}).expect(400);
    await request(app).post(`/api/community/${postId}/report`).set('Cookie',cookie).send({reason:'safety'}).expect(201);
    assert.equal(reported.user,userId);assert.equal(reported.status,'open');
  } finally {Article.exists=exists;Bookmark.updateOne=update;Bookmark.deleteOne=remove;Report.create=create;}
});
