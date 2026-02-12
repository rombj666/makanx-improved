
import { useState, useEffect } from 'react';

interface ManifestItem {
  name: string;
  path: string;
}

export function DebugStatic() {
  const [manifest, setManifest] = useState<ManifestItem[]>([]);
  const [checks, setChecks] = useState<Record<string, { status: number, type: string | null }>>({});

  useEffect(() => {
    // Fetch manifest
    fetch('/maps/manifest.json')
      .then(res => res.json())
      .then(data => setManifest(data))
      .catch(err => console.error('Manifest load failed', err));
  }, []);

  const checkUrl = async (url: string) => {
    try {
      const res = await fetch(url);
      setChecks(prev => ({
        ...prev,
        [url]: { status: res.status, type: res.headers.get('content-type') }
      }));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">Static File Debugger</h1>
      
      <div className="space-y-4 border p-4 rounded">
        <h2 className="font-bold">Manifest</h2>
        <pre className="bg-gray-100 p-2 text-xs">{JSON.stringify(manifest, null, 2)}</pre>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {manifest.map(item => (
          <div key={item.path} className="border p-4 rounded space-y-2">
            <h3 className="font-bold">{item.name}</h3>
            <p className="text-sm font-mono">{item.path}</p>
            
            <div className="flex gap-4 items-start">
              <img src={item.path} className="h-32 object-cover border" alt="Preview" />
              
              <div className="space-y-2">
                <button 
                  onClick={() => checkUrl(item.path)}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                >
                  Check Headers
                </button>
                
                {checks[item.path] && (
                  <div className="text-sm">
                    <p>Status: {checks[item.path].status}</p>
                    <p>Type: {checks[item.path].type}</p>
                    {checks[item.path].type?.includes('html') && (
                      <p className="text-red-600 font-bold">⚠️ HTML Fallback Detected!</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* Manual check for known file if manifest fails */}
        <div className="border p-4 rounded space-y-2 bg-gray-50">
            <h3 className="font-bold">Manual Check: sg-food-fest-2026.jpg</h3>
            <button 
                onClick={() => checkUrl('/maps/sg-food-fest-2026.jpg')}
                className="px-3 py-1 bg-gray-200 rounded text-sm"
            >
                Check File
            </button>
            {checks['/maps/sg-food-fest-2026.jpg'] && (
                <div className="text-sm">
                <p>Status: {checks['/maps/sg-food-fest-2026.jpg'].status}</p>
                <p>Type: {checks['/maps/sg-food-fest-2026.jpg'].type}</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
