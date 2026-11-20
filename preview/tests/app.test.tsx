// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';

const socketMock = vi.hoisted(() => {
 const listeners:Record<string,()=>void>={};
 return {listeners, disconnect:vi.fn(), on:vi.fn((event:string,handler:()=>void)=>{listeners[event]=handler;})};
});
vi.mock('socket.io-client',()=>({io:()=>socketMock}));


beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.removeAttribute('data-font');
  window.scrollTo = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({error: 'The service is not configured yet.'}), {status: 503, headers: {'Content-Type':'application/json'}})));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function mount(path: string) { return render(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>); }
describe('public SPA', () => {
  it('navigates between separate pages and marks the current route', async () => {
    mount('/');
    expect(screen.getByRole('heading', {level:1})).toHaveTextContent('Growing in faith');
    await userEvent.click(screen.getByRole('link', {name:'About', exact:true}));
    expect(screen.getByRole('heading', {level:1})).toHaveTextContent('Faith, friendship');
    expect(screen.getByRole('link', {name:'About', exact:true})).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('heading', {name: /Growing in faith/i})).not.toBeInTheDocument();
  });
  it('redirects the old documents page to sign in instead of exposing PDFs', async () => {
    mount('/documents');
    expect(await screen.findByRole('heading', {name:/Welcome back/i})).toBeInTheDocument();
    expect(screen.queryByRole('link', {name:/Client proposal/i})).not.toBeInTheDocument();
  });
  it('redirects legacy hash links to the matching public route', async () => {
    mount('/#events');
    expect(await screen.findByRole('heading', {level:1})).toHaveTextContent('Make room for');
  });
  it('exposes a clearly labelled dashboard preview without authentication', async () => {
    mount('/portal');
    await userEvent.click(await screen.findByRole('button', {name:/Explore dashboard preview/i}));
    expect(screen.getByText(/No account is signed in/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name:'Finance', exact:true}));
    expect(screen.getByRole('complementary')).toHaveTextContent('Church accounts');
    await userEvent.click(screen.getByRole('button', {name:'Moderator', exact:true}));
    expect(screen.getByRole('complementary')).toHaveTextContent('Post reports');
    await userEvent.click(screen.getByRole('button', {name:'Admin', exact:true}));
    expect(screen.getByText('Unread messages')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name:'Back to sign in'}));
    expect(screen.getByRole('heading', {name:/Welcome back/i})).toBeInTheDocument();
  });
});

describe('configured workspace', () => {
  it('shows real admin overview data and filters the member list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith('/auth/me') ? {user:{id:'a',name:'Admin User',email:'admin@example.test',role:'admin'}}
        : url.endsWith('/admin/overview') ? {members:2,upcomingEvents:3,unreadMessages:1,registrations:4,draftArticles:1}
        : url.endsWith('/admin/members') ? {members:[{_id:'1',name:'Alice Example',email:'alice@example.test',role:'member'},{_id:'2',name:'Bob Example',email:'bob@example.test',role:'member'}]} : {};
      return new Response(JSON.stringify(data), {status:200,headers:{'Content-Type':'application/json'}});
    }));
    mount('/portal');
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText(/1 draft update awaiting publication/)).toBeInTheDocument();
    const sidebar = screen.getByRole('complementary');
    const { within } = await import('@testing-library/react');
    await userEvent.click(within(sidebar).getByRole('button', {name:'Members'}));
    expect(await screen.findByText('Alice Example')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', {name:'Search members'}), 'alice');
    expect(screen.queryByText('Bob Example')).not.toBeInTheDocument();
  });
});

describe('drawers and new features', () => {
  it('opens appearance options and closes the drawer with Escape', async () => {
    mount('/');
    await userEvent.click(screen.getByRole('button', {name:'Open appearance settings'}));
    expect(screen.getByRole('dialog', {name:'Appearance'})).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name:/Modern sans/i}));
    expect(document.documentElement.dataset.font).toBe('modern');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', {name:'Appearance'})).not.toBeInTheDocument();
  });
  it('opens and navigates using the mobile drawer', async () => {
    mount('/');
    await userEvent.click(screen.getByRole('button', {name:'Open navigation'}));
    const {within} = await import('@testing-library/react');
    const drawer = screen.getByRole('dialog', {name:'Explore'});
    await userEvent.click(within(drawer).getByRole('link', {name:/Ministries/}));
    expect(screen.getByRole('heading', {level:1})).toHaveTextContent('Your gifts have');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('filters published library resources and opens their detail drawer', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input:RequestInfo|URL) => {
      const data = String(input).includes('/api/resources') ? {resources:[{_id:'1',kind:'teaching',title:'Faith and community',description:'A reflection',body:'A sample teaching',url:'',published:true},{_id:'2',kind:'sermon',title:'Sunday message',description:'A sermon',body:'A sample sermon',url:'',published:true}]} : {};
      return new Response(JSON.stringify(data), {status:200,headers:{'Content-Type':'application/json'}});
    }));
    mount('/resources');
    expect(await screen.findByText('Sunday message')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name:'Teachings'}));
    expect(screen.queryByText('Sunday message')).not.toBeInTheDocument();
    const {within} = await import('@testing-library/react');
    const card = screen.getByText('Faith and community').closest('article')!;
    await userEvent.click(within(card).getByRole('button', {name:/Explore resource/}));
    expect(screen.getByRole('dialog', {name:'Faith and community'})).toHaveTextContent('A sample teaching');
  });
  it('navigates the calendar by month', async () => {
    mount('/events');
    const previous=screen.getByRole('button', {name:'Previous month'});
    const heading=previous.closest('.calendar-heading')!.querySelector('h3')!;
    const before=heading.textContent;
    await userEvent.click(screen.getByRole('button', {name:'Next month'}));
    expect(heading.textContent).not.toBe(before);
  });
});

describe('community and faith pages', () => {
  it('shows clearly labelled feed examples when the service is unavailable', async () => {
    mount('/community');
    expect(await screen.findByText(/not published posts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/DESIGN PREVIEW/i).length).toBeGreaterThan(0);
  });
  it('lets a signed-in member submit a comment for moderation', async () => {
    const requests: {url:string;method:string;body?:string}[] = [];
    const post = {_id:'507f1f77bcf86cd799439012',title:'Welcome',body:'Hello together',authorLabel:'Ministry team',createdAt:'2026-01-01T00:00:00.000Z',likes:0,comments:0};
    vi.stubGlobal('fetch', vi.fn(async (input:RequestInfo|URL, init?:RequestInit) => {
      const url=String(input); const method=init?.method||'GET'; requests.push({url,method,body:init?.body as string});
      const data = url.endsWith('/auth/me') ? {user:{id:'a',name:'A Member',email:'member@example.test',role:'member'}}
        : url.includes('/community/liked?') ? {likes:[]}
        : url.endsWith('/community') ? {posts:[post]}
        : url.endsWith('/comments') && method==='GET' ? {comments:[]}
        : url.endsWith('/comments') && method==='POST' ? {status:'pending'} : {};
      return new Response(JSON.stringify(data), {status:200,headers:{'Content-Type':'application/json'}});
    }));
    mount('/community');
    expect(await screen.findByRole('heading',{name:'Welcome'})).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:/Comments/}));
    const {within}=await import('@testing-library/react'); const drawer=screen.getByRole('dialog',{name:'Community conversation'});
    await userEvent.type(within(drawer).getByLabelText('Add a comment'),'Thank you for sharing');
    await userEvent.click(within(drawer).getByRole('button',{name:'Submit comment'}));
    expect(await within(drawer).findByText(/submitted for review/i)).toBeInTheDocument();
    const sent=requests.find(r=>r.url.endsWith('/comments')&&r.method==='POST');
    expect(JSON.parse(sent!.body!)).toEqual({text:'Thank you for sharing',showName:false});
  });
  it('offers Bible and music categories on the library page', async () => {
    mount('/library');
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('A little space');
    expect(screen.getByRole('button',{name:'Music'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Bible'})).toBeInTheDocument();
    expect(screen.getByRole('img',{name:/AI-generated illustration of an open Bible/i})).toBeInTheDocument();
  });
});

describe('shared community links', () => {
  it('loads a published shared post even when it is outside the latest feed', async () => {
    const id='507f1f77bcf86cd799439012';
    vi.stubGlobal('fetch', vi.fn(async (input:RequestInfo|URL) => {
      const url=String(input);
      const data=url.endsWith('/community')?{posts:[]}:url.endsWith('/community/'+id)?{post:{_id:id,title:'An older reflection',body:'Welcome back',authorLabel:'Community member',createdAt:'2026-01-01T00:00:00.000Z',likes:2,comments:0}}:{error:'Please sign in.'};
      return new Response(JSON.stringify(data),{status:url.endsWith('/auth/me')?401:200,headers:{'Content-Type':'application/json'}});
    }));
    mount('/community?post='+id);
    expect(await screen.findByRole('heading',{name:'An older reflection'})).toBeInTheDocument();
  });
});

describe('faith library starters', () => {
  it('provides publicly accessible Bible and music links', () => {
    mount('/library');
    expect(screen.getByRole('link',{name:/Open the Bible/i})).toHaveAttribute('href','https://www.vatican.va/archive/ENG0839/_INDEX.HTM');
    expect(screen.getByRole('link',{name:/Explore the channel/i})).toHaveAttribute('href','https://www.tiktok.com/@st.maurus.youth.s');
  });
});


describe('appearance preferences', () => {
  it('defaults to dark regardless of a light system preference', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn()})));
    mount('/');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button',{name:'Open appearance settings'}));
    expect(screen.getByRole('button',{name:/Dark.*Default/i})).toHaveAttribute('aria-pressed','true');
  });
  it('remembers an explicit light choice after remount', async () => {
    const rendered=mount('/');
    await userEvent.click(screen.getByRole('button',{name:'Open appearance settings'}));
    await userEvent.click(screen.getByRole('button',{name:/Light.*Warm daylight/i}));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('maurus-preview-theme')).toBe('light');
    rendered.unmount(); mount('/');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('remembers system mode and responds to device theme changes', async () => {
    let listener: (()=>void)|undefined;
    const media={matches:false,addEventListener:vi.fn((_event:string,fn:()=>void)=>{listener=fn;}),removeEventListener:vi.fn()};
    vi.stubGlobal('matchMedia',vi.fn(()=>media));
    localStorage.setItem('maurus-preview-theme','system');
    const rendered=mount('/');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('maurus-preview-theme')).toBe('system');
    media.matches=true; listener?.();
    expect(document.documentElement.dataset.theme).toBe('dark');
    rendered.unmount(); mount('/');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('maurus-preview-theme')).toBe('system');
  });
});

describe('membership, progress and broadcasts', () => {
  it('shows public broadcast details and links to the hosting service', async () => {
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/broadcasts')?{broadcasts:[{_id:'507f1f77bcf86cd799439012',title:'Sunday message',description:'A reflection',url:'https://example.org/video',status:'recorded',scheduledAt:null,published:true}]}:{}),{status:200,headers:{'Content-Type':'application/json'}})));
    mount('/broadcasts');
    expect(await screen.findByRole('heading',{name:'Sunday message'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:/Watch recording/})).toHaveAttribute('href','https://example.org/video');
    expect(screen.getByText(/Live labels are set by the ministry/)).toBeInTheDocument();
  });
  it('lets a member request membership and mark a resource complete', async () => {
    const requests:{url:string;method:string}[]=[];
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input),method=init?.method||'GET';requests.push({url,method});
      const data=url.endsWith('/auth/me')?{user:{id:'a',name:'Member',email:'m@example.test',role:'member'}}:
        url.endsWith('/my/overview')?{registrations:0,upcoming:[]}:
        url.endsWith('/my/membership')?(method==='POST'?{membership:{status:'pending'}}:{membership:null}):
        url.endsWith('/resources')?{resources:[{_id:'507f1f77bcf86cd799439012',kind:'teaching',title:'Living in faith',description:'A reflection',published:true}]}:
        url.endsWith('/my/progress')?{progress:[]}:{};
      return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
    }));
    mount('/portal');const {within}=await import('@testing-library/react'); const sidebar=await screen.findByRole('complementary');
    await userEvent.click(within(sidebar).getByRole('button',{name:'Membership'}));
    await userEvent.click(await screen.findByRole('button',{name:/Request membership/}));
    expect(await screen.findByText('Awaiting review')).toBeInTheDocument();
    await userEvent.click(within(sidebar).getByRole('button',{name:'My progress'}));
    await userEvent.click(await screen.findByRole('button',{name:'Mark completed'}));
    expect(await screen.findByRole('button',{name:/Completed · undo/})).toHaveAttribute('aria-pressed','true');
    expect(requests.some(r=>r.url.endsWith('/my/progress/507f1f77bcf86cd799439012')&&r.method==='PUT')).toBe(true);
  });
});

it('opens a sermon broadcast from a community announcement', async () => {
  const id='507f1f77bcf86cd799439012';
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);const data=url.endsWith('/community')?{posts:[{_id:'507f1f77bcf86cd799439013',title:'Sunday sermon',body:'Watch together',authorLabel:'Ministry team',broadcast:id,createdAt:'2026-01-01T00:00:00Z',likes:3,comments:0}]}:url.endsWith('/broadcasts')?{broadcasts:[{_id:id,title:'Sunday sermon',description:'Watch together',url:'https://example.org/video',status:'recorded',published:true}]}:{error:'Sign in'};return new Response(JSON.stringify(data),{status:url.endsWith('/auth/me')?401:200,headers:{'Content-Type':'application/json'}})}));
  mount('/community');await userEvent.click(await screen.findByRole('link',{name:/Watch sermon or broadcast/}));
  expect(await screen.findByRole('link',{name:/Watch recording/})).toHaveAttribute('href','https://example.org/video');
});


describe('private documents and production preview', () => {
  it('lists authenticated downloads only inside the administrator workspace', async () => {
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);const data=url.endsWith('/auth/me')?{user:{id:'a',name:'Admin',email:'a@example.test',role:'admin'}}:url.endsWith('/admin/overview')?{members:0,upcomingEvents:0,unreadMessages:0,registrations:0,draftArticles:0}:url.endsWith('/admin/documents')?{documents:[{file:'client-proposal.pdf',title:'Client proposal & agreement'}]}:{};return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})}));
    mount('/portal');const {within}=await import('@testing-library/react');const sidebar=await screen.findByRole('complementary');
    await userEvent.click(within(sidebar).getByRole('button',{name:'Project documents'}));
    const link=await screen.findByRole('link',{name:/Client proposal & agreement/});
    expect(link).toHaveAttribute('href','/api/admin/documents/client-proposal.pdf');expect(link).toHaveAttribute('download');
  });
  it('does not expose the dashboard preview in production mode', async () => {
    vi.stubEnv('DEV',false);
    const view=mount('/portal');
    expect(await screen.findByRole('heading',{name:/Welcome back/i})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Explore dashboard preview/i})).not.toBeInTheDocument();
    view.unmount();
  });
});

it('lets administrators select resource destinations before publishing', async () => {
  let saved:any;vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);const data=url.endsWith('/auth/me')?{user:{id:'a',name:'Admin',email:'a@example.test',role:'admin'}}:url.endsWith('/admin/overview')?{members:0,upcomingEvents:0,unreadMessages:0,registrations:0,draftArticles:0}:url.endsWith('/admin/resources')?(init?.method==='POST'?(saved=JSON.parse(String(init.body)),{resource:saved}):{resources:[]}):{};return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})}));
  mount('/portal');const {within}=await import('@testing-library/react');const sidebar=await screen.findByRole('complementary');
  await userEvent.click(within(sidebar).getByRole('button',{name:'Faith library'}));
  await userEvent.click(await screen.findByRole('button',{name:/Add resource/}));
  const drawer=screen.getByRole('dialog',{name:'Add a resource'});
  await userEvent.type(within(drawer).getByLabelText('Title'),'A reflection');
  await userEvent.type(within(drawer).getByLabelText('Short description'),'A little reflection');
  await userEvent.click(within(drawer).getByLabelText('Resources page'));
  await userEvent.click(within(drawer).getByLabelText('Meditations page'));
  await userEvent.click(within(drawer).getByLabelText('Publish selected destinations'));
  await userEvent.click(within(drawer).getByRole('button',{name:/Save resource/}));
  expect(await screen.findByText('Resource saved.')).toBeInTheDocument();
  expect(saved.placements).toEqual(['library','meditations']);expect(saved.published).toBe(true);
});

describe('search and inclusive controls', () => {
  it('searches published content and shows linked results', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if(String(input).startsWith('/api/search?')) return new Response(JSON.stringify({results:[{type:'Community',title:'A prayer',description:'Welcome',url:'/community?post=507f1f77bcf86cd799439012'}]}),{status:200});
      return new Response(JSON.stringify({error:'unavailable'}),{status:503});
    }));
    mount('/search'); await userEvent.type(screen.getByRole('searchbox',{name:'Search the site'}),'prayer'); await userEvent.click(screen.getByRole('button',{name:'Search'}));
    expect(await screen.findByRole('link',{name:'A prayer'})).toHaveAttribute('href','/community?post=507f1f77bcf86cd799439012');
    expect(screen.getByText(/1 result found/)).toHaveAttribute('role','status');
  });
  it('removes the selection control and clears an earlier saved preference', async () => {
    localStorage.setItem('maurus-selectable','true'); document.documentElement.setAttribute('data-selectable','true');
    mount('/');await userEvent.click(screen.getByRole('button',{name:'Open appearance settings'}));
    expect(screen.queryByRole('button',{name:/text selection/i})).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-selectable');expect(localStorage.getItem('maurus-selectable')).toBeNull();
  });
});

it('lets signed-in members save and report published community posts', async () => {
 const id='507f1f77bcf86cd799439012';const requests:{url:string;method:string;body:unknown}[]=[];
 vi.stubGlobal('fetch',vi.fn(async (input:RequestInfo|URL,init?:RequestInit)=>{
   const url=String(input);const method=init?.method||'GET';requests.push({url,method,body:init?.body});
   const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
   if(url==='/api/community')return response({posts:[{_id:id,title:'Welcome',body:'Hello everyone',authorLabel:'Community member',createdAt:'2026-01-01T00:00:00Z',likes:0,comments:0}]});
   if(url==='/api/auth/me')return response({user:{id:'507f1f77bcf86cd799439011',name:'Member',email:'a@example.test',role:'member'}});
   if(url.startsWith('/api/community/liked'))return response({likes:[]});
   if(url.startsWith('/api/community/saved'))return response({saved:[]});
   if(url.endsWith('/save'))return response({saved:true});
   if(url.endsWith('/report'))return response({ok:true},201);
   return response({error:'unavailable'},503);
 }));
 mount('/community');await screen.findByRole('heading',{name:'Welcome'});await screen.findByRole('button',{name:'Save'});await userEvent.click(screen.getByRole('button',{name:'Save'}));
 expect(await screen.findByRole('button',{name:'Saved'})).toHaveAttribute('aria-pressed','true');
 await userEvent.click(screen.getByRole('button',{name:'Report'}));await userEvent.selectOptions(screen.getByRole('combobox',{name:'Reason'}),'spam');await userEvent.click(screen.getByRole('button',{name:'Send report'}));
 expect(await screen.findByText(/Report sent to the moderation team/)).toBeInTheDocument();
 expect(requests.some(r=>r.url===`/api/community/${id}/report` && r.method==='POST' && r.body===JSON.stringify({reason:'spam'}))).toBe(true);
});

describe('administrator church accounts', () => {
 it('records a KES entry with password reauthentication and displays totals', async () => {
  const calls:{url:string;method:string;body?:string}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=String(input), method=init?.method||'GET'; calls.push({url,method,body:init?.body as string});
   const data=url.endsWith('/auth/me')?{user:{id:'a',name:'Admin User',email:'admin@example.test',role:'admin'}}:url.endsWith('/admin/overview')?{members:0,upcomingEvents:0,unreadMessages:0,registrations:0,draftArticles:0}:url.endsWith('/admin/ledger')&&method==='GET'?{entries:[],nextCursor:null,totals:{income:'12345',expense:'25',net:'12320'}}:{id:'507f1f77bcf86cd799439012'};
   return new Response(JSON.stringify(data),{status:200});
  }));
  mount('/portal');const {within}=await import('@testing-library/react');const sidebar=await screen.findByRole('complementary');await userEvent.click(within(sidebar).getByRole('button',{name:'Church accounts'}));
  expect(await screen.findByText('KES 123.45')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Record entry'}));const drawer=screen.getByRole('dialog',{name:'Record an entry'});
  await userEvent.type(within(drawer).getByLabelText('Amount in KES'),'12.34');await userEvent.type(within(drawer).getByLabelText('Category'),'Outreach');await userEvent.type(within(drawer).getByLabelText('Description'),'Fundraiser');await userEvent.type(within(drawer).getByLabelText('Your account password'),'example-password');
  await userEvent.click(within(drawer).getByRole('button',{name:'Record entry'}));
  await vi.waitFor(()=>expect(calls.some(c=>c.url==='/api/admin/ledger'&&c.method==='POST')).toBe(true));
  const payload=JSON.parse(calls.find(c=>c.url==='/api/admin/ledger'&&c.method==='POST')!.body!);expect(payload.amount).toBe('12.34');expect(payload.currentPassword).toBe('example-password');expect(payload.requestKey).toMatch(/^[a-f0-9-]{36}$/);
 });
 it('never shows church accounts to members',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/auth/me')?{user:{id:'m',name:'Member',email:'member@example.test',role:'member'}}:{registrations:0,upcoming:[]}),{status:200})));
  mount('/portal');const sidebar=await screen.findByRole('complementary');const {within}=await import('@testing-library/react');expect(within(sidebar).queryByRole('button',{name:'Church accounts'})).not.toBeInTheDocument();
 });
 it('requires a password for administrator member suspension',async()=>{
  const calls:{url:string;body?:string}[]=[];vi.spyOn(window,'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push({url,body:init?.body as string});const user={_id:'507f1f77bcf86cd799439012',name:'Alice Example',email:'alice@example.test',role:'member',active:true};const data=url.endsWith('/auth/me')?{user:{id:'a',name:'Admin User',email:'admin@example.test',role:'admin'}}:url.endsWith('/admin/overview')?{members:1,upcomingEvents:0,unreadMessages:0,registrations:0,draftArticles:0}:url.endsWith('/admin/members')?{members:[user]}:url.endsWith('/status')?{member:{...user,active:false}}:{member:user};return new Response(JSON.stringify(data),{status:200});}));
  mount('/portal');const {within}=await import('@testing-library/react');const sidebar=await screen.findByRole('complementary');await userEvent.click(within(sidebar).getByRole('button',{name:'Members'}));await screen.findByText('Alice Example');await userEvent.click(screen.getByRole('button',{name:/View profile/}));const dialog=await screen.findByRole('dialog',{name:'Member profile'});await within(dialog).findByLabelText('Administrator password');await userEvent.click(within(dialog).getByRole('button',{name:'Suspend member'}));expect(within(dialog).getByText('Enter your administrator password first.')).toBeInTheDocument();await userEvent.type(within(dialog).getByLabelText('Administrator password'),'admin-pass');await userEvent.click(within(dialog).getByRole('button',{name:'Suspend member'}));await vi.waitFor(()=>expect(calls.some(c=>c.url.endsWith('/status'))).toBe(true));expect(JSON.parse(calls.find(c=>c.url.endsWith('/status'))!.body!)).toEqual({active:false,currentPassword:'admin-pass'});
  vi.restoreAllMocks();
 });
});

describe('role-aware dashboard navigation',()=>{
 for(const role of ['finance','moderator'] as const){
  it(`shows the ${role} workspace without admin-only sections`,async()=>{
   vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);const data=url.endsWith('/auth/me')?{user:{id:'u',name:'Team User',email:'team@example.test',role}}:{registrations:0,upcoming:[]};return new Response(JSON.stringify(data),{status:200});}));
   mount('/portal');const {within}=await import('@testing-library/react');const sidebar=await screen.findByRole('complementary');
   expect(within(sidebar).queryByRole('button',{name:'Members'})).not.toBeInTheDocument();expect(within(sidebar).queryByRole('button',{name:'Project documents'})).not.toBeInTheDocument();
   expect(within(sidebar).queryByRole('button',{name:'Church accounts'})).toEqual(role==='finance'?expect.anything():null);
   expect(within(sidebar).queryByRole('button',{name:'Moderation'})).toEqual(role==='moderator'?expect.anything():null);
   const quick=screen.getByRole('navigation',{name:'Dashboard quick navigation',hidden:true});expect(within(quick).getByRole('button',{name:'Open workspace menu',hidden:true})).toBeInTheDocument();
   expect(within(quick).getByRole('button',{name:role==='finance'?'Accounts':'Moderation',hidden:true})).toBeInTheDocument();
  });
 }
 it('lets an admin assign a restricted role with password confirmation',async()=>{
  const calls:{url:string;body?:string}[]=[];vi.spyOn(window,'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push({url,body:init?.body as string});const user={_id:'507f1f77bcf86cd799439012',name:'Alice Example',email:'alice@example.test',role:'member',active:true};const data=url.endsWith('/auth/me')?{user:{id:'a',name:'Admin User',email:'admin@example.test',role:'admin'}}:url.endsWith('/admin/overview')?{members:1,upcomingEvents:0,unreadMessages:0,registrations:0,draftArticles:0}:url.endsWith('/admin/members')?{members:[user]}:url.endsWith('/role')?{member:{...user,role:'finance'}}:{member:user};return new Response(JSON.stringify(data),{status:200});}));
  mount('/portal');const {within}=await import('@testing-library/react');const sidebar=await screen.findByRole('complementary');await userEvent.click(within(sidebar).getByRole('button',{name:'Members'}));await screen.findByText('Alice Example');await userEvent.click(screen.getByRole('button',{name:/View profile/}));const dialog=await screen.findByRole('dialog',{name:'Member profile'});await within(dialog).findByLabelText('Workspace role');await userEvent.selectOptions(within(dialog).getByLabelText('Workspace role'),'finance');await userEvent.type(within(dialog).getByLabelText('Administrator password'),'admin-pass');await userEvent.click(within(dialog).getByRole('button',{name:'Change role'}));await vi.waitFor(()=>expect(calls.some(c=>c.url.endsWith('/role'))).toBe(true));expect(JSON.parse(calls.find(c=>c.url.endsWith('/role'))!.body!)).toEqual({role:'finance',currentPassword:'admin-pass'});expect(await within(dialog).findByText(/Role updated/)).toBeInTheDocument();vi.restoreAllMocks();
 });
});

it('opens dashboard side navigation and switches panels from the mobile bar',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);const data=url.endsWith('/auth/me')?{user:{id:'m',name:'Member',email:'m@example.test',role:'member'}}:url.endsWith('/my/overview')?{registrations:0,upcoming:[]}:url.includes('/resources')?{resources:[]}:{events:[]};return new Response(JSON.stringify(data),{status:200})}));
 mount('/portal');const {within}=await import('@testing-library/react');await screen.findByRole('complementary');const nav=screen.getByRole('navigation',{name:'Dashboard quick navigation',hidden:true});
 fireEvent.click(within(nav).getByRole('button',{name:'Library',hidden:true}));expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Faith library');expect(within(nav).getByRole('button',{name:'Library',hidden:true})).toHaveAttribute('aria-current','page');
 fireEvent.click(within(nav).getByRole('button',{name:'Open workspace menu',hidden:true}));const drawer=screen.getByRole('dialog',{name:'Workspace'});expect(within(drawer).getByRole('navigation',{name:'Workspace navigation'})).toBeInTheDocument();await userEvent.keyboard('{Escape}');expect(screen.queryByRole('dialog',{name:'Workspace'})).not.toBeInTheDocument();
});

describe('location and dashboard notifications',()=>{
 it('shows the map, explains privacy, and allows hiding and loading again',async()=>{
  mount('/contact');expect(document.querySelector('.topbar')).not.toBeInTheDocument();expect(screen.getByRole('heading',{name:/Come find community/i})).toBeInTheDocument();
  const frame=screen.getByTitle(/Interactive search map for St. Maurus/);expect(frame).toHaveAttribute('src',expect.stringContaining('https://www.google.com/maps?'));
  expect(screen.getByText(/sharing your IP address with Google/i)).toBeInTheDocument();expect(screen.getByText(/Loading the interactive map/i)).toHaveAttribute('role','status');
  fireEvent.load(frame);expect(screen.getByText(/Map frame opened/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Hide map'}));expect(screen.queryByTitle(/Interactive search map/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Load interactive map'}));expect(screen.getByTitle(/Interactive search map/)).toBeInTheDocument();
  expect(screen.getByRole('link',{name:/Open directions/i})).toHaveAttribute('href',expect.stringContaining('google.com/maps/search'));
  expect(screen.getByRole('link',{name:/Search OpenStreetMap/i})).toHaveAttribute('href',expect.stringContaining('openstreetmap.org'));
 });
 it('offers fallback directions if the map is slow',()=>{
  vi.useFakeTimers();try{mount('/contact');act(()=>vi.advanceTimersByTime(12000));expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
  expect(screen.getByRole('link',{name:/Open directions/i})).toBeInTheDocument();fireEvent.load(screen.getByTitle(/Interactive search map/));expect(screen.getByText(/Map frame opened/i)).toBeInTheDocument();
  } finally {vi.useRealTimers();}
 });
 it('updates the notification badge, marks read, and opens an allowed section',async()=>{
  let read=false;const requests:{url:string;method:string}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input),method=init?.method||'GET';requests.push({url,method});const item={_id:'507f1f77bcf86cd799439012',message:'Your membership request has been reviewed.',target:'Membership',readAt:read?'2026-11-19T00:00:00Z':null,createdAt:'2026-11-19T00:00:00Z'};
   if(url.endsWith('/read')&&method==='PATCH'){read=true;return new Response(JSON.stringify({ok:true}),{status:200});}
   const data=url.endsWith('/auth/me')?{user:{id:'m',name:'Member',email:'m@example.test',role:'member'}}:url.endsWith('/notifications')?{items:[item],unread:read?0:1}:url.endsWith('/my/membership')?{membership:null}:{registrations:0,upcoming:[]};return new Response(JSON.stringify(data),{status:200});}));
  mount('/portal');expect(await screen.findByRole('button',{name:'Notifications, 1 unread'})).toBeInTheDocument();
  socketMock.listeners.connect?.();socketMock.listeners['notifications:changed']?.();
  await userEvent.click(screen.getByRole('button',{name:'Notifications, 1 unread'}));const {within}=await import('@testing-library/react');const drawer=screen.getByRole('dialog',{name:'Notifications'});expect(within(drawer).getByText('Your membership request has been reviewed.')).toBeInTheDocument();
  await userEvent.click(within(drawer).getByRole('button',{name:'Open Membership'}));expect(await screen.findByRole('button',{name:'Notifications, 0 unread'})).toBeInTheDocument();expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Membership');expect(requests.some(r=>r.url.endsWith('/read')&&r.method==='PATCH')).toBe(true);
 });
});

describe('accessible navigation and preferences', () => {
 it('announces route changes and isolates the background while a drawer is open', async () => {
  const {container} = mount('/');
  expect(screen.getByRole('status')).toHaveTextContent('Home page');
  const trigger=screen.getByRole('button',{name:'Open appearance settings'});
  await userEvent.click(trigger);
  expect(container).toHaveAttribute('inert');
  expect(screen.getByRole('group',{name:'COLOUR THEME'})).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:/Light Warm daylight/i}));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('maurus-preview-theme')).toBe('light');
  await userEvent.keyboard('{Escape}');
  expect(container).not.toHaveAttribute('inert');
  expect(trigger).toHaveFocus();
  await userEvent.click(screen.getByRole('link',{name:'About',exact:true}));
  expect(screen.getByRole('status')).toHaveTextContent('About page');
 });
});

describe('header and draft policy review', () => {
 it('removes the utility bar and keeps appearance accessible on website and sign-in', async () => {
  const view=mount('/');
  expect(document.querySelector('.topbar')).not.toBeInTheDocument();
  expect(screen.getByRole('banner')).toContainElement(screen.getByRole('button',{name:'Open appearance settings'}));
  view.unmount(); mount('/portal');
  const appearance=await screen.findByRole('button',{name:'Open appearance settings'});
  await userEvent.click(appearance);
  expect(screen.getByRole('dialog',{name:'Appearance'})).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(appearance).toHaveFocus();
 });
 it('keeps appearance accessible in a signed-in dashboard', async () => {
  vi.stubGlobal('fetch',vi.fn(async (input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/auth/me')?{user:{id:'a',name:'Alice',email:'alice@example.test',role:'member'}}:{items:[],unread:0,registrations:0,upcoming:[]}),{status:200,headers:{'Content-Type':'application/json'}})));
  mount('/portal'); await screen.findByRole('heading',{name:/Welcome, Alice/i});
  expect(document.querySelector('.topbar')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Open appearance settings'}));
  expect(screen.getByRole('dialog',{name:'Appearance'})).toBeInTheDocument();
 });
 it('shows draft privacy, terms and safeguarding without publishing project documents', () => {
  mount('/policies#site-terms');
  expect(screen.getByText(/working draft, not approved legal terms/i)).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Your information'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Using this community'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Protecting our community'})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Terms of service'})).toHaveAttribute('href','#site-terms');
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(screen.queryByRole('link',{name:/agreement.*milestones/i})).not.toBeInTheDocument();
 });
 it('links the registration form to the draft without asserting acceptance', async () => {
  mount('/portal'); await userEvent.click(await screen.findByRole('button',{name:'Create an account'}));
  expect(screen.getByRole('link',{name:/draft privacy notice and site terms/i})).toHaveAttribute('href','/policies');
  expect(screen.getByText(/They are not yet approved/)).toBeInTheDocument();
  expect(screen.queryByRole('checkbox',{name:/agree/i})).not.toBeInTheDocument();
 });
});

it('updates the browser theme colour with the chosen appearance', async () => {
 const meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta);
 try {
  mount('/');expect(meta.content).toBe('#182a24');
  await userEvent.click(screen.getByRole('button',{name:'Open appearance settings'}));
  await userEvent.click(screen.getByRole('button',{name:/Light.*Warm daylight/i}));
  expect(meta.content).toBe('#f8f4eb');
 } finally {meta.remove();}
});

it('saves the selected palette across modes and reloads', async () => {
 const meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta);
 try {
  const rendered=mount('/');expect(document.documentElement.dataset.palette).toBe('sanctuary');
  await userEvent.click(screen.getByRole('button',{name:'Open appearance settings'}));
  expect(screen.getByRole('group',{name:'COLOUR PALETTE'})).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:/Ocean Blue & stone/i}));
  expect(document.documentElement.dataset.palette).toBe('ocean');expect(localStorage.getItem('maurus-palette')).toBe('ocean');expect(meta.content).toBe('#1a2c37');
  await userEvent.click(screen.getByRole('button',{name:/Light Warm daylight/i}));expect(meta.content).toBe('#f1f6f5');
  await userEvent.click(screen.getByRole('button',{name:/Chapel Plum & rose/i}));expect(document.documentElement.dataset.palette).toBe('chapel');expect(meta.content).toBe('#f9f2ee');
  rendered.unmount();mount('/');expect(document.documentElement.dataset.palette).toBe('chapel');expect(document.documentElement.dataset.theme).toBe('light');
 } finally {meta.remove();}
});
