export type SourcesEntityParams = {
  source_id: string;
  metadata: string;
};

export type SourcesMetadata = {
  id: string;
  name?: string;
  icon?: string;
  urlMainnet?: string;
  urlRinkeby?: string;
};

export class SourcesEntity {
  sourceId: string;
  metadata: string;

  constructor(params: SourcesEntityParams) {
    this.sourceId = params.source_id;
    this.metadata = params.metadata;
  }
}
