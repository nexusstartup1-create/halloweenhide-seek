const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const Icon = {
  hud: () => <svg viewBox="0 0 24 24"><path {...P} d="M3 4h18v16H3zM3 9h18M9 9v11" /></svg>,
  map: () => <svg viewBox="0 0 24 24"><path {...P} d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" /></svg>,
  cross: () => <svg viewBox="0 0 24 24"><path {...P} d="M12 2v6M12 16v6M2 12h6M16 12h6" /><rect {...P} x="7" y="7" width="10" height="10" /></svg>,
  deck: () => <svg viewBox="0 0 24 24"><path {...P} d="M7 3h12v16H7zM4 6v15h12" /></svg>,
  comms: () => <svg viewBox="0 0 24 24"><path {...P} d="M3 4h18v12H10l-5 4v-4H3z" /></svg>,
  quest: () => <svg viewBox="0 0 24 24"><path {...P} d="M12 2l9 10-9 10-9-10z" /><path {...P} d="M12 8v5M12 15v2" /></svg>,
  shield: () => <svg viewBox="0 0 24 24"><path {...P} d="M12 2l8 3v7c0 5-4 8-8 10-4-2-8-5-8-10V5z" /></svg>,
};

export const Glyph = {
  drop: () => <svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" d="M12 3c3.5 4.2 6 7.4 6 10.5a6 6 0 1 1-12 0C6 10.4 8.5 7.2 12 3z" /></svg>,
  exit: () => <svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" /></svg>,
  vibrate: () => <svg viewBox="0 0 24 24"><rect x="8" y="4" width="8" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth={2} /><path d="M4 9v6M20 9v6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>,
  locate: () => <svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 3 3 10.5l7.5 2.9L13.4 21z" /></svg>,
};
