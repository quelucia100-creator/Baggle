let loading: Promise<void> | undefined;
declare global { interface Window { baggleMapsReady?: () => void } }
export function loadGoogleMap() {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const key = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'];
    const channel = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID'];
    if (!key) { reject(new Error("Google Maps is not connected.")); return; }
    const script = document.createElement("script");
    window.baggleMapsReady = () => { resolve(); delete window.baggleMapsReady; };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=baggleMapsReady&channel=${encodeURIComponent(channel ?? "")}`;
    script.async = true;
    script.onerror = () => { loading = undefined; script.remove(); reject(new Error("Could not load Google Maps. Please try again.")); };
    document.head.appendChild(script);
  });
  return loading;
}