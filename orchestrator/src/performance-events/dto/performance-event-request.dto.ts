export type PerformanceEventMetricsDto = {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  engagement_rate: number;
};

export type PerformanceEventRequestDto = {
  generation_id: string | null;
  platform: string;
  post_id: string | null;
  metrics: PerformanceEventMetricsDto;
};
