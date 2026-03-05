import {
  CONTENT_REVIEW_V1_PRESET_ID,
  KNOWLEDGE_HOOKS_DOCUMENT_ID,
  KNOWLEDGE_RAG_DOCUMENT_ID,
  KNOWLEDGE_REVIEW_DOCUMENT_ID,
  PERSONA_DOCUMENT_ID,
} from './constants';
import type { PipelinePresetDefinition } from '../pipeline-presets/pipeline-preset.types';

export type SeedRagDocument = {
  id: string;
  docType: 'persona' | 'knowledge';
  platform: string | null;
  structure: string | null;
  tags: string[];
  source: string;
  content: string;
  metadata: Record<string, unknown>;
};

export function buildContentReviewPresetDefinition(options: {
  contentQueue: string;
  reviewQueue: string;
}): PipelinePresetDefinition {
  return {
    version: 'v1',
    steps: [
      {
        name: 'content',
        agent: 'content',
        queue: options.contentQueue,
        timeout_ms: 300_000,
        max_retries: 3,
      },
      {
        name: 'review',
        agent: 'review',
        queue: options.reviewQueue,
        timeout_ms: 300_000,
        max_retries: 3,
      },
    ],
  };
}

export function getSeedPreset() {
  return {
    id: CONTENT_REVIEW_V1_PRESET_ID,
    name: 'content_review_v1',
  };
}

export function getSeedRagDocuments(): SeedRagDocument[] {
  return [
    {
      id: PERSONA_DOCUMENT_ID,
      docType: 'persona',
      platform: null,
      structure: 'voice_profile',
      tags: ['persona', 'voice', 'technical', 'pt-br'],
      source: 'seed:persona:bootstrap-admin',
      content: [
        'Escreva como um engenheiro de produto que explica sistemas com clareza e objetividade.',
        'Priorize rigor tecnico, exemplos concretos, linguagem direta e framing orientado a implementacao.',
        'Evite marketing vazio, frases infladas e promessas sem sustentacao tecnica.',
        'O tom deve combinar profundidade com legibilidade para LinkedIn: abrir forte, desenvolver raciocinio e fechar com CTA util.',
      ].join(' '),
      metadata: {
        title: 'Bootstrap technical persona',
        locale: 'pt-BR',
        seed_key: 'bootstrap-persona-v1',
        audience: 'engenheiros e builders de IA',
      },
    },
    {
      id: KNOWLEDGE_HOOKS_DOCUMENT_ID,
      docType: 'knowledge',
      platform: 'linkedin',
      structure: 'post_framework',
      tags: ['knowledge', 'linkedin', 'hooks', 'cta'],
      source: 'seed:knowledge:linkedin-framework',
      content: [
        'Para posts tecnicos no LinkedIn, use hook especifico no inicio, corpo com tradeoffs reais e CTA objetivo no final.',
        'Hooks fortes geralmente abrem com problema concreto, custo de erro ou contraste entre duas abordagens.',
        'O corpo deve manter progressao: contexto, decisao tecnica, impacto operacional e limite conhecido.',
        'A CTA deve convidar para comparacao de estrategias, benchmark ou troca de experiencias, nunca para autopromocao vazia.',
      ].join(' '),
      metadata: {
        title: 'LinkedIn hook/body/cta framework',
        locale: 'pt-BR',
        seed_key: 'knowledge-linkedin-framework-v1',
        intent: 'estrutura de post tecnico',
      },
    },
    {
      id: KNOWLEDGE_REVIEW_DOCUMENT_ID,
      docType: 'knowledge',
      platform: 'linkedin',
      structure: 'review_checklist',
      tags: ['knowledge', 'linkedin', 'review', 'quality'],
      source: 'seed:knowledge:review-heuristics',
      content: [
        'Na revisao, preserve o objetivo do texto e ajuste clareza, legibilidade, fluidez e conformidade com a plataforma.',
        'Cheque se cada paragrafo avanca o raciocinio, se a terminologia permanece consistente e se o CTA fecha a narrativa.',
        'Remova redundancias, abstracoes vagas e claims tecnicas nao suportadas por exemplo, dado ou mecanismo.',
        'O texto final deve soar humano, tecnico e editado, sem cheiro de resposta generica de modelo.',
      ].join(' '),
      metadata: {
        title: 'Review heuristics for technical content',
        locale: 'pt-BR',
        seed_key: 'knowledge-review-heuristics-v1',
        intent: 'criterios de revisao',
      },
    },
    {
      id: KNOWLEDGE_RAG_DOCUMENT_ID,
      docType: 'knowledge',
      platform: 'linkedin',
      structure: 'rag_practices',
      tags: ['knowledge', 'rag', 'observability', 'llm'],
      source: 'seed:knowledge:rag-observability',
      content: [
        'Ao falar de RAG e LLM em producao, destaque o fluxo completo: retrieval, reranking, prompt, validacao, tracing e custo.',
        'Explique o porque das decisoes de arquitetura com impacto em confiabilidade, reprodutibilidade e debuggabilidade.',
        'Quando possivel, compare solucoes simples e complexas e explicite porque uma escolha pragmatica venceu no MVP.',
        'Use linguagem que ajude o leitor a visualizar o sistema rodando, nao apenas conceitos abstratos.',
      ].join(' '),
      metadata: {
        title: 'RAG and observability talking points',
        locale: 'pt-BR',
        seed_key: 'knowledge-rag-observability-v1',
        intent: 'base conceitual para conteudo tecnico',
      },
    },
  ];
}
