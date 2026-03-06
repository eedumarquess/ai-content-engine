export type GenerateContentRequestDto = {
  topic: string;
  platform: string;
  format: string;
  pipeline_preset_id: string;
  persona_id?: string | null;
};
