// Mirror of backend pydantic schemas (kept thin/manual to avoid codegen churn).
export interface User { id: number; username: string }

export interface Tag { id: number; name: string; color: string | null }

export interface Folder {
  id: number
  parent_id: number | null
  name: string
  created_at: string
  updated_at: string
}

export interface FileItem {
  id: number
  uuid: string
  folder_id: number
  name: string
  size_bytes: number
  content_type: string
  has_thumbnail: boolean
  has_poster: boolean
  created_at: string
  updated_at: string
  tags: Tag[]
}

export interface Breadcrumb { id: number; name: string }
export interface FolderDetail { folder: Folder; breadcrumb: Breadcrumb[] }
export interface FolderListing { folders: Folder[]; files: FileItem[]; next_cursor: string | null }

export interface UploadPartInfo { part_number: number; size: number; etag: string }
export interface UploadServerState {
  id: string
  folder_id: number
  filename: string
  size_bytes: number
  content_type: string
  chunk_size: number
  total_parts: number
  status: 'init' | 'uploading' | 'completed' | 'aborted'
  parts: UploadPartInfo[]
}

export interface ZipEntry {
  path: string
  is_dir: boolean
  size: number
  compressed_size: number
  modified: string | null
}

export interface ShareOut {
  id: number
  token: string
  target_type: 'file' | 'folder'
  file_id: number | null
  folder_id: number | null
  has_password: boolean
  expires_at: string | null
  max_downloads: number | null
  download_count: number
  created_at: string
  revoked_at: string | null
}

export interface SharePublicMeta {
  token: string
  target_type: 'file' | 'folder'
  name: string
  requires_password: boolean
  expires_at: string | null
  files: FileItem[] | null
  folders: Folder[] | null
}

export interface AuditEntry {
  id: number
  user_id: number | null
  action: string
  entity_type: string | null
  entity_id: number | null
  extra_data: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

export interface ApiError { code: string; message: string }

