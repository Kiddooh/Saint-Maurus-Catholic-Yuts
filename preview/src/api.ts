export type Account = { id: string; name: string; email: string; role: 'member' | 'finance' | 'moderator' | 'admin'; bio?: string; avatar?: string; active?: boolean };
export type EventItem = { _id: string; title: string; description: string; date: string; location: string; published: boolean };
export type ArticleItem = { _id: string; title: string; body: string; published: boolean; submittedBy?: string | null; authorLabel?: string; createdAt?: string };
export type Registration = { _id: string; event: EventItem | null; user?: { name: string; email: string } | null };
export type Message = { _id: string; name: string; email: string; message: string; status: 'new' | 'read'; category?: 'general'|'ministry'|'volunteer'|'visitor'; interest?: string };
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  let data: any; try { data = await response.json(); } catch { throw new Error('The service could not be reached. Please try again later.'); }
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data as T;
}
export const json = (data: unknown) => JSON.stringify(data);
export function formatDate(date: string) { return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(date)); }

export type ResourcePlacement = 'library'|'resources'|'meditations';
export type ResourceItem = { placements?: ResourcePlacement[]; _id: string; kind: 'sermon'|'teaching'|'library'|'music'|'bible'|'meditation'; title: string; description: string; body: string; url: string; published: boolean };

export type CommunityPost = { _id: string; title: string; body: string; authorLabel: string; createdAt: string; broadcast?: string | null; likes: number; comments: number };
export type PublicComment = { _id: string; displayName: string; text: string; createdAt: string };
export type MyCommunity = { likes: string[]; posts: { _id:string; title:string; published:boolean; createdAt:string }[]; comments: { _id:string; article:{title:string;published:boolean}|null; text:string; status:'pending'|'approved'|'rejected'; createdAt:string }[] };
export type ModeratedComment = { _id:string; article:{title:string;published:boolean}|null; user:{name:string;email:string}|null; displayName:string; text:string; status:'pending'|'approved'|'rejected'; createdAt:string };
