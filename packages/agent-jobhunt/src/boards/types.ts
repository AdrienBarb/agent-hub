export interface ParsedJob {
  slug: string;
  board: string;
  title: string;
  company: string | null;
  city: string | null;
  url: string;
}

export interface BoardAdapter {
  id: string;
  displayName: string;
  parse(md: string): ParsedJob[];
}
