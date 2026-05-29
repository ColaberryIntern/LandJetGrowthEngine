'use client';

import { useState } from 'react';
import { useExtensionInstalled } from '@/lib/useExtensionInstalled';

// "Download Chrome Extension" button + install instructions modal.
//
// Renders nothing when the extension is installed AND up to date.
// Renders an amber "Update" pill when installed but outdated.
// Renders a primary download button when not installed.
//
// Lives in the LinkedIn outreach queue page header. Tailwind classes only.

export function ExtensionInstallButton() {
  const { loading, installed, installedVersion, latest, needsUpdate } = useExtensionInstalled();
  const [showModal, setShowModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (installed && !needsUpdate) return null;

  const downloadUrl = latest?.downloadUrl || '/api/extension/latest';
  const labelVersion = latest?.version || '';

  // The download endpoint requires authentication so the backend can bake the
  // user's api_token into the zip's config.js. We fetch with the JWT, convert
  // the response to a blob, then trigger a download. (A plain <a href download>
  // cannot send Authorization headers.)
  async function handleDownload() {
    setError(null);
    setDownloading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(downloadUrl, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Please log in again to download.' : `Download failed: ${res.status}`);
      }
      const blob = await res.blob();
      // Try to read the personalized filename out of Content-Disposition.
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : `landjet-extension-v${labelVersion || 'latest'}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setShowModal(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        {needsUpdate ? (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
            title={`You have v${installedVersion}, v${labelVersion} is available`}
          >
            <span aria-hidden>↑</span>
            {downloading ? 'Preparing...' : `Update Extension ${labelVersion ? `(v${labelVersion})` : ''}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <span aria-hidden>⬇</span>
            {downloading ? 'Preparing...' : `Download Chrome Extension ${labelVersion ? `(v${labelVersion})` : ''}`}
          </button>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ext-install-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
              <h2 id="ext-install-modal-title" className="text-lg font-semibold text-gray-900">
                {needsUpdate ? 'Update' : 'Install'} the LandJet LinkedIn Assistant
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="mb-3 text-sm text-gray-600">
                The download has started{latest ? ` (${(latest.sizeBytes / 1024).toFixed(0)} KB)` : ''}.
                Once it finishes, follow these four steps:
              </p>
              <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-gray-700">
                <li>
                  <strong>Unzip the file</strong> on your computer (right-click the downloaded
                  <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">{latest?.filename || 'extension-v*.zip'}</code>
                  and choose Extract All).
                </li>
                <li>
                  Open Chrome and paste this URL into the address bar:
                  <button
                    type="button"
                    className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-800 hover:bg-gray-200"
                    onClick={() => navigator.clipboard?.writeText('chrome://extensions').catch(() => {})}
                    title="Click to copy"
                  >
                    chrome://extensions
                  </button>
                  <span className="ml-1 text-xs text-gray-500">(Chrome blocks links to it.)</span>
                </li>
                <li>
                  Toggle <strong>Developer mode</strong> on in the top-right corner.
                </li>
                <li>
                  Click <strong>Load unpacked</strong> and select the folder you unzipped in step 1.
                </li>
              </ol>
              <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                <strong>&#10003; No token needed.</strong> Your zip is already personalized with your account.
                After loading, the extension is ready to use &mdash; just open a LinkedIn profile.
              </div>
              {needsUpdate && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <strong>Updating from v{installedVersion}?</strong> Before loading the new folder,
                  remove the old extension from <code>chrome://extensions</code> first.
                </div>
              )}
              {!needsUpdate && (
                <p className="text-xs text-gray-500">
                  Refresh this page after installing and the button will disappear automatically.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {downloading ? 'Preparing...' : 'Download again'}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
