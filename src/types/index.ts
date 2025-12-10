// Job-related types
export interface JobProgress {
  phase: 'uploading' | 'converting' | 'ocr' | 'extracting' | 'finalizing' | 'complete' | 'error';
  current: number;
  total: number;
  message?: string;
}

// Extraction mode - language learning vs textbook concepts
export type ExtractionMode = 'language' | 'concept';

// Category for concept entries - covers all academic subjects
export type ConceptCategory =
  | 'concept'     // Abstract ideas, theories, principles
  | 'term'        // Technical terminology, jargon
  | 'definition'  // Dictionary-style definitions
  | 'formula'     // Mathematical/chemical equations
  | 'theorem'     // Mathematical theorems, laws, proofs
  | 'rule'        // Grammar rules, conventions, patterns
  | 'example'     // Example usages, demonstrations
  | 'technique'   // Methods, procedures, approaches
  | 'acronym'     // Abbreviations with meanings
  | 'event'       // Historical events with dates
  | 'person'      // Important figures
  | 'place'       // Geographic/historical locations
  | 'date'        // Important dates/periods
  | 'process'     // Step-by-step procedures
  | 'tool'        // Software, instruments, equipment
  | 'protocol';   // Standards, procedures, methods

// Entry for textbook concept extraction
export interface ConceptEntry {
  term: string;
  definition: string;
  category?: ConceptCategory;
  confidence: 'high' | 'medium' | 'low';
  pageNumber?: number;
}

export interface VocabularyEntry {
  // Primary fields for multilingual vocabulary
  nativeScript?: string;      // Original characters (Arabic أهلا, Chinese 你好, etc.)
  romanization?: string;      // Latin transliteration (ahlan, nǐ hǎo, etc.)
  definition: string;         // English translation/meaning (required)

  // Metadata
  confidence: 'high' | 'medium' | 'low';
  pageNumber?: number;

  // Backward compatibility - computed from romanization or nativeScript
  term: string;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateJobResponse {
  jobId: string;
  totalPages: number;
  fileName: string;
}

export interface ProcessBatchResponse {
  pagesProcessed: number;
  totalPages: number;
  status: string;
}

export interface ExtractVocabularyResponse {
  vocabularyCount: number;
  chunksProcessed: number;
  totalChunks: number;
}

export interface FinalizeResponse {
  vocabularyCount: number;
  csvReady: boolean;
}

// Processing types (from existing OCR code)
export interface PageImage {
  pageNumber: number;
  buffer: Buffer;
  width?: number;
  height?: number;
}

export interface OCRResult {
  pageNumber: number;
  text: string;
  confidence: number;
  processingTime: number;
}

export interface PreprocessOptions {
  grayscale?: boolean;
  normalize?: boolean;
  sharpen?: boolean;
  threshold?: number;
}

// LLM types
export interface LLMVocabularyResponse {
  vocabulary: VocabularyEntry[];
}

export interface ChunkResult {
  chunkIndex: number;
  vocabulary: VocabularyEntry[];
  error?: string;
}

// Chapter detection types
export interface Chapter {
  number: number;
  title: string;
  startPage: number;
  endPage?: number;
}

export interface ChapterVocabulary {
  chapter: Chapter;
  vocabulary: VocabularyEntry[];
}

// Saved export types
export type SavedExportType = 'csv_anki' | 'csv_excel' | 'flashcards_pdf';

export interface SavedExport {
  id: string;
  userId: string;
  jobId: string;
  name: string;
  type: SavedExportType;
  fileUrl: string;
  fileSize: number;
  itemCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface SaveExportRequest {
  jobId: string;
  type: SavedExportType;
  name?: string;
}

export interface ExportUsage {
  tier: string;
  exportsUsed: number;
  exportLimit: number;
  exportsRemaining: number;
  canSave: boolean;
}

// Subscription types
export type SubscriptionTier = 'free' | 'basic' | 'pro' | 'unlimited';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  tierName: string;
  status: SubscriptionStatus;
  pagesUsed: number;
  pageLimit: number;
  pagesRemaining: number;
  exportsUsed: number;
  exportLimit: number;
  exportsRemaining: number;
  canSaveExports: boolean;
  periodEnd: string | null;
}
