export type DailyApiUsageEntityParams = {
  day: string;
  route: string;
  api_calls_count: number;
  api_key: string;
};

export class DailyApiUsageEntity {
  day: string;
  route: string;
  apiCallsCount: number;
  apiKey: string;

  constructor(params: DailyApiUsageEntityParams) {
    this.day = params.day;
    this.route = params.route;
    this.apiCallsCount = params.api_calls_count;
    this.apiKey = params.api_key;
  }
}
