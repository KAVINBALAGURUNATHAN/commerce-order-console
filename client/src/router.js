import { useEffect, useState } from 'react';

// Minimal hash router: #/dashboard, #/new, #/orders, #/orders/ORD-00012?status=PLACED
// Hash routes survive refresh and work when Express serves the built app.
function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/dashboard';
  const [path, qs = ''] = raw.split('?');
  const [page = 'dashboard', id] = path.split('/').filter(Boolean);
  return { page, id: id ? decodeURIComponent(id) : null, query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const navigate = (to) => {
  window.location.hash = to;
};
