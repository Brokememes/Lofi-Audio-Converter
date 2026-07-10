import seoData from './pages.json';

export type ToolId =
  | 'lofi'
  | 'vocal_remover'
  | 'pitcher'
  | 'key_bpm'
  | 'cutter'
  | 'joiner'
  | 'recorder'
  | 'slowed_reverb'
  | 'spatial_8d'
  | 'audio_to_video';

export interface SeoPage {
  toolId: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  steps: string[];
  faq: { q: string; a: string }[];
}

export const SEO_PAGES: SeoPage[] = seoData.pages;

const normalizePath = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : `${trimmed}/`;
};

export function toolIdFromPath(pathname: string): ToolId {
  if (pathname === '/' || pathname === '') return 'lofi';
  const normalized = normalizePath(pathname);
  const page = SEO_PAGES.find(p => p.path === normalized);
  return (page?.toolId as ToolId) ?? 'lofi';
}

export function pathFromToolId(toolId: ToolId): string {
  const page = SEO_PAGES.find(p => p.toolId === toolId);
  return page?.path ?? '/';
}

export function applyDocumentMeta(toolId: ToolId): void {
  const page = SEO_PAGES.find(p => p.toolId === toolId);
  if (!page) return;
  document.title = page.title;
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', page.description);
  }
}

export function navigateToTool(toolId: ToolId): void {
  const path = pathFromToolId(toolId);
  if (window.location.pathname !== path) {
    window.history.pushState({ toolId }, '', path);
  }
  applyDocumentMeta(toolId);
}
