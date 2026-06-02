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
                  <td className="px-5 py-3 font-mono text-xs text-gray-900">{f.filename}</td>
                  <td className="px-5 py-3 text-xs text-gray-600">{fmtSize(f.size_bytes)}</td>
                  <td className="px-5 py-3 text-xs text-gray-600">{new Date(f.uploaded_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
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

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <strong>Wiring an attachment to a campaign step:</strong> After uploading, set <code className="rounded bg-amber-100 px-1 py-0.5">sequence_steps[i].attachment_path = "&lt;filename&gt;"</code> on the campaign you want it on. Per-step attachment selector in the campaign editor is a separate task (BC 9956274272); until that ships, use the campaign PATCH endpoint or the DB directly. Once set, the next time a lead advances to that step, the outreach engine reads the file from the directory above and attaches it to the email automatically.
      </div>
    </div>
  );
}
