export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInvariant {
  id: string;
  projectId: string;
  content: string;
  createdAt: string;
}
