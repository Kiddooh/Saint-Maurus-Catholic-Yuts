import { useEffect, useState } from 'react';
import { ArrowDownToLine, LockKeyhole } from 'lucide-react';
import { api } from './api';

type ProjectDocument = { file:string; title:string };
export function ProjectDocuments(){
 const [documents,setDocuments]=useState<ProjectDocument[]>([]);const [status,setStatus]=useState('Loading private documents…');
 useEffect(()=>{api<{documents:ProjectDocument[]}>('/admin/documents').then(data=>{setDocuments(data.documents);setStatus(data.documents.length?'':'No project documents are available in private storage.');}).catch(e=>setStatus(e instanceof Error?e.message:'Documents are unavailable.'));},[]);
 return <section className="workspace-panel"><div className="panel-list-head"><div><p className="overline"><span>✦</span> ADMINISTRATOR ONLY</p><h2>Private project documents</h2><p>Confidential project plans and guides are separate from public faith resources. Downloads require an administrator session.</p></div><LockKeyhole size={24}/></div>{status&&<p className="form-status" role="status">{status}</p>}<div className="document-grid admin-document-grid">{documents.map(doc=><a className="document-card" key={doc.file} href={'/api/admin/documents/'+encodeURIComponent(doc.file)} download><span><ArrowDownToLine size={20}/></span><div><strong>{doc.title}</strong><small>PRIVATE PDF · DOWNLOAD</small></div></a>)}</div><p className="field-hint">Downloads and copies must also be stored securely. Do not share these files publicly.</p></section>;
}
