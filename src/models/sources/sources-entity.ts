export type SourcesEntityParams = {
  source_id: string;
  metadata: SourcesMetadata;
};

export type SourcesMetadata = {
  id: string;
  name?: string;
  icon?: string | null;
  url?: string | null;
  urlMainnet?: string | null;
  urlRinkeby?: string | null;
};

export class SourcesEntity {
  sourceId: string;
  metadata: SourcesMetadata;

  constructor(params: SourcesEntityParams) {
    this.sourceId = params.source_id;
    this.metadata = params.metadata;
  }
}
