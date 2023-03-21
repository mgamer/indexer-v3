export type HourlyApiUsageEntityParams = {
  hour: string;
  route: string;
  api_calls_count: number;
  api_key: string;
};

export class HourlyApiUsageEntity {
  hour: string;
  route: string;
  apiCallsCount: number;
  apiKey: string;

  constructor(params: HourlyApiUsageEntityParams) {
    this.hour = params.hour;
    this.route = params.route;
    this.apiCallsCount = params.api_calls_count;
    this.apiKey = params.api_key;
  }
}
