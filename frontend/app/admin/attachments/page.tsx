'use client';

import { useState, useEffect, useRef } from 'react';
import { ensureAuth } from '@/lib/auth';

interface AttachmentFile {
  filename: string;
  size_bytes: number;
  uploaded_at: string;
}

interface ListResponse {
  attachments_dir: string;
  files: AttachmentFile[];
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip "data:application/pdf;base64," prefix
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AttachmentsPage() {
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [dir, setDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Inline preview: fetched as a blob (the download endpoint needs the bearer
  // token) and shown in a modal, so a click previews without leaving the page.
  const [viewing, setViewing] = useState<{ filename: string; url: string; kind: 'pdf' | 'image' | 'other' } | null>(null);
  const [viewLoading, setViewLoading] = useState<string | null>(null);

  async function fetchList() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/attachments', { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: ListResponse = await r.json();
      setFiles(data.files);
      setDir(data.attachments_dir);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    (async () => { await ensureAuth(); await fetchList(); })();
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError(`${file.name}: file is ${fmtSize(file.size)} -- 25MB max.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const r = await fetch('/api/admin/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ filename: file.name, base64 }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as any).error || `HTTP ${r.status}`);
      setNotice(`Uploaded ${file.name}.`);
      setTimeout(() => setNotice(null), 4000);
      await fetchList();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError(`${file.name}: ${(e as Error).message}`);
    } finally { setUploading(false); }
  }

  async function handleDelete(filename: string) {
    if (!confirm(`Delete ${filename}? Any campaign step pointing at it will silently send without an attachment until you point it at something else.`)) return;
    setDeleting(filename);
    try {
      const r = await fetch(`/api/admin/attachments/${encodeURIComponent(filename)}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as any).error || `HTTP ${r.status}`);
      }
      setNotice(`Deleted ${filename}.`);
      setTimeout(() => setNotice(null), 4000);
      await fetchList();
    } catch (e) {
      setError(`Delete ${filename}: ${(e as Error).message}`);
    } finally { setDeleting(null); }
  }

  function kindOf(filename: string): 'pdf' | 'image' | 'other' {
    const ext = (filename.toLowerCase().split('.').pop() || '');
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg'].includes(ext)) return 'image';
    return 'other';
  }

  async function openViewer(filename: string) {
    setViewLoading(filename);
    setError(null);
    try {
      const r = await fetch(`/api/admin/attachments/${encodeURIComponent(filename)}/download`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      setViewing({ filename, url: URL.createObjectURL(blob), kind: kindOf(filename) });
    } catch (e) {
      setError(`Could not open ${filename}: ${(e as Error).message}`);
    } finally { setViewLoading(null); }
  }

  function closeViewer() {
    setViewing(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Outreach Attachments</h1>
        <p className="mt-1 text-sm text-gray-500">
          PDFs and decks that get attached to campaign emails. Each campaign step references a file by name via <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">sequence_steps[i].attachment_path</code>. The investor deck attaches on the investor outreach step Ryan picked; the intro deck attaches after the second touch on industry outreach.
        </p>
        {dir && <p className="mt-1 text-xs text-gray-400">Stored at <code className="font-mono">{dir}</code> on the backend.</p>}
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Upload a new attachment</label>
        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" onChange={handleUpload} disabled={uploading}
            accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg"
            className="block flex-1 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800 file:cursor-pointer disabled:opacity-50" />
          {uploading && <span className="text-xs text-gray-500">Uploading…</span>}
        </div>
        <p className="mt-2 text-xs text-gray-500">PDF / DOCX / PPTX / PNG / JPEG. 25 MB max per file. Filename allows letters, digits, dots, underscores, hyphens.</p>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</div>}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Files ({files.length})</h2>
          <button onClick={fetchList} className="text-xs text-blue-600 hover:text-blue-800">Refresh</button>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-gray-500">Loading…</div>
        ) : files.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">No attachments yet. Upload a PDF above to get started.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-5 py-2 font-medium">Filename</th>
                <th className="px-5 py-2 font-medium">Size</th>
                <th className="px-5 py-2 font-medium">Uploaded</th>
                <th className="px-5 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {files.map(f => (
                <tr key={f.filename} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <button onClick={() => openViewer(f.filename)} title="Preview"
                      className="font-mono text-xs text-blue-700 hover:text-blue-900 hover:underline text-left">
                      {f.filename}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-600">{fmtSize(f.size_bytes)}</td>
                  <td className="px-5 py-3 text-xs text-gray-600">{new Date(f.uploaded_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openViewer(f.filename)} disabled={viewLoading === f.filename}
                      className="mr-4 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                      {viewLoading === f.filename ? 'Opening…' : 'View'}
                    </button>
                    <button onClick={() => handleDelete(f.filename)} disabled={deleting === f.filename}
                      className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50">
                      {deleting === f.filename ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
        <strong>Attaching a document to outreach:</strong> Open a campaign, go to the <strong>Strategy</strong> tab, pick a <strong>Campaign document</strong>, and check it on whichever email steps you want. You can also attach a document to an individual send from the <strong>Outreach</strong> review queue using the per-email <em>Attachment</em> dropdown. Click any file above to preview it.
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog" aria-modal="true" onClick={closeViewer}>
          <div className="flex h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <h3 className="truncate font-mono text-sm font-medium text-gray-800">{viewing.filename}</h3>
              <div className="flex items-center gap-3">
                <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 hover:text-blue-800">Open in new tab</a>
                <a href={viewing.url} download={viewing.filename} className="text-xs font-medium text-blue-600 hover:text-blue-800">Download</a>
                <button onClick={closeViewer} aria-label="Close" className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100">
              {viewing.kind === 'pdf' && (
                <iframe title={viewing.filename} src={viewing.url} className="h-full w-full border-0" />
              )}
              {viewing.kind === 'image' && (
                <div className="flex h-full items-center justify-center p-4">
                  <img src={viewing.url} alt={viewing.filename} className="max-h-full max-w-full object-contain" />
                </div>
              )}
              {viewing.kind === 'other' && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-gray-600">
                  <p>This file type can&apos;t be previewed in the browser (Office documents need to be downloaded).</p>
                  <a href={viewing.url} download={viewing.filename} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">Download {viewing.filename}</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
