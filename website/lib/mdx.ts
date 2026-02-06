import fs from "fs";
import path from "path";
import matter from "gray-matter";

const contentDirectory = path.join(process.cwd(), "content/docs");

export interface DocFrontmatter {
  title: string;
  description?: string;
  order?: number;
}

export interface DocContent {
  frontmatter: DocFrontmatter;
  content: string;
  slug: string;
}

/**
 * Get a specific document by category and slug
 */
export function getDocBySlug(
  category: string,
  slug: string
): DocContent | null {
  const fullPath = path.join(contentDirectory, category, `${slug}.mdx`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    frontmatter: data as DocFrontmatter,
    content,
    slug,
  };
}

/**
 * Get all documents in a category
 */
export function getDocsByCategory(category: string): DocContent[] {
  const categoryPath = path.join(contentDirectory, category);

  if (!fs.existsSync(categoryPath)) {
    return [];
  }

  const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".mdx"));

  return files.map((filename) => {
    const slug = filename.replace(/\.mdx$/, "");
    const doc = getDocBySlug(category, slug);
    return doc!;
  });
}

/**
 * Check if a doc exists
 */
export function docExists(category: string, slug: string): boolean {
  const fullPath = path.join(contentDirectory, category, `${slug}.mdx`);
  return fs.existsSync(fullPath);
}
