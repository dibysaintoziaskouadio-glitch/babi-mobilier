// Icônes en trait, 24 px, couleur héritée.
type P = { className?: string };
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' };

export const IconHome = ({ className = 'h-5 w-5' }: P) => (<svg {...base} className={className} aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>);
export const IconGrid = ({ className = 'h-5 w-5' }: P) => (<svg {...base} className={className} aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>);
export const IconBag = ({ className = 'h-5 w-5' }: P) => (<svg {...base} className={className} aria-hidden="true"><path d="M6 7h12l-1 13H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>);
export const IconUser = ({ className = 'h-5 w-5' }: P) => (<svg {...base} className={className} aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>);
export const IconSearch = ({ className = 'h-5 w-5' }: P) => (<svg {...base} className={className} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>);
export const IconPlus = ({ className = 'h-4 w-4' }: P) => (<svg {...base} className={className} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>);
export const IconMinus = ({ className = 'h-4 w-4' }: P) => (<svg {...base} className={className} aria-hidden="true"><path d="M5 12h14" /></svg>);
export const IconTrash = ({ className = 'h-4 w-4' }: P) => (<svg {...base} className={className} aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
