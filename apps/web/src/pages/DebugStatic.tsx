
import { useState, useEffect } from 'react';

export function DebugStatic() {
  const [status, setStatus] = useState<number | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    fetch('/maps/sg-food-fest-2026.jpg')
      .then(async (res) => {
        setStatus(res.status);
        const type = res.headers.get('content-type');
        setContentType(type);
        if (type && type.includes('text')) {
          const text = await res.text();
          setPreview(text.slice(0, 200));
        } else {
          setPreview('(Binary content)');
        }
      })
      .catch((err) => {
        setPreview(`Error: ${err.message}`);
      });
  }, []);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">Static File Debugger</h1>
      
      <div className="space-y-2 border p-4 rounded">
        <h2 className="font-bold">Test Image: /maps/sg-food-fest-2026.jpg</h2>
        <img 
          src="/maps/sg-food-fest-2026.jpg" 
          alt="Test Map" 
          className="w-64 h-auto border border-red-500"
        />
        <div>
          <a 
            href="/maps/sg-food-fest-2026.jpg" 
            target="_blank" 
            className="text-blue-600 underline"
          >
            Open map in new tab
          </a>
        </div>
      </div>

      <div className="space-y-2 border p-4 rounded bg-gray-50">
        <h2 className="font-bold">Fetch Response</h2>
        <p><strong>Status:</strong> {status}</p>
        <p><strong>Content-Type:</strong> {contentType}</p>
        <div className="mt-2">
          <strong>Preview:</strong>
          <pre className="bg-gray-200 p-2 rounded text-xs overflow-auto mt-1">
            {preview}
          </pre>
        </div>
      </div>
      
      <div className="space-y-2 border p-4 rounded">
        <h2 className="font-bold">Health Check: /maps/healthcheck.txt</h2>
        <iframe src="/maps/healthcheck.txt" className="w-full h-20 border" />
      </div>
    </div>
  );
}
