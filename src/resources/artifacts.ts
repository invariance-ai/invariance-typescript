import type { HttpClient } from '../client.js';
import { sha256BytesHex } from '../crypto.js';

export type ArtifactKind = 'screenshot' | 'dom' | 'har' | 'video' | 'log' | 'blob';

export interface ArtifactRef {
  artifact_id: string;
  sha256: string;
  kind: ArtifactKind;
  mime: string;
  byte_size: number;
  url?: string | null;
}

export interface UploadArtifactInput {
  runId: string;
  nodeId?: string;
  kind: ArtifactKind;
  mime: string;
  data: Uint8Array | ArrayBuffer | string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

interface InitUploadResponse {
  artifact_id: string;
  upload_url: string;
  expires_at: string;
}

interface FinalizeResponse extends ArtifactRef {}

function toUint8(data: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

export class ArtifactsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Upload a binary artifact (screenshot, DOM dump, HAR, video, etc.) and link
   * it to a run (and optionally a specific node). Three-step:
   *
   *   1. POST /v1/artifacts — server returns presigned `upload_url`.
   *   2. PUT bytes to `upload_url` (no Authorization header; signed).
   *   3. POST /v1/artifacts/{id}/finalize — server confirms hash + size and
   *      returns an `ArtifactRef` ready to attach to a node.
   */
  async upload(input: UploadArtifactInput): Promise<ArtifactRef> {
    const bytes = toUint8(input.data);
    const sha256 = sha256BytesHex(bytes);
    const init = await this.http.post<InitUploadResponse>('/v1/artifacts', {
      run_id: input.runId,
      node_id: input.nodeId,
      kind: input.kind,
      mime: input.mime,
      filename: input.filename,
      sha256,
      byte_size: bytes.byteLength,
      metadata: input.metadata,
    });

    // Slice into a fresh ArrayBuffer so the body type isn't ArrayBufferLike.
    const buf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const putRes = await fetch(init.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': input.mime },
      body: new Blob([buf], { type: input.mime }),
    });
    if (!putRes.ok) {
      throw new Error(
        `Artifact upload PUT failed: ${putRes.status} ${putRes.statusText}`,
      );
    }

    return this.http.post<FinalizeResponse>(
      `/v1/artifacts/${encodeURIComponent(init.artifact_id)}/finalize`,
      { sha256, byte_size: bytes.byteLength },
    );
  }

  async get(artifactId: string): Promise<ArtifactRef> {
    return this.http.get<ArtifactRef>(
      `/v1/artifacts/${encodeURIComponent(artifactId)}`,
    );
  }
}
