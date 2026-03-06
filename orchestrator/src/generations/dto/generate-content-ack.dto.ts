export type GenerateContentAckDto = {
  generation_id: string;
  status: 'queued';
  status_url: string;
};
