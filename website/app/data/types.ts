export interface App {
  name: string;
  tagline: string;
  description: string;
  color: string;
  icon: string;
  stats: string;
  tags: string[];
}

export interface WhyItem {
  title: string;
  description: string;
  icon: string;
  color: string;
}

export interface Stat {
  value: string;
  label: string;
}

export interface ArchitectureLayer {
  label: string;
  items: string[];
  color: string;
}

export interface Standard {
  name: string;
  full: string;
  desc: string;
  color: string;
}

export interface VisionPoint {
  icon: string;
  text: string;
  emphasis?: string;
}

export interface FooterLink {
  name: string;
  url?: string;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

export interface Step {
  step: string;
  title: string;
  desc: string;
}

export interface Category {
  icon: string;
  color: string;
  title: string;
  description: string;
}

export interface NavLink {
  href: string;
  label: string;
}
<<<<<<< HEAD
=======

// Documentation types
export interface DocPage {
  slug: string;
  title: string;
  description?: string;
}

export interface DocCategory {
  title: string;
  slug: string;
  pages: DocPage[];
}

export interface TableOfContentsItem {
  id: string;
  title: string;
  level: number;
}

export interface DocSearchResult {
  slug: string;
  title: string;
  category: string;
  description?: string;
  snippet?: string;
  matchStart?: number;
  matchEnd?: number;
}

// Skills types
export interface Skill {
  slug: string;
  name: string;
  title: string;
  description: string;
  keywords: string[];
  icon: string;
  color: string;
  features: string[];
}
>>>>>>> origin/main
