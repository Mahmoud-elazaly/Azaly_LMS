import { createServer } from 'node:http';

const malformedEvaluations = new Set();

createServer(async (request, response) => {
  function reply(status, body) {
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  }

  if (request.url === '/health') return reply(200, {});
  if (request.method !== 'POST' || request.headers['x-goog-api-key'] !== 'interview-test') return reply(403, {});
  let body = '';
  for await (const part of request) body += part;
  const payload = JSON.parse(body);
  if (request.url.endsWith(':countTokens')) {
    if (!payload.generateContentRequest?.systemInstruction) return reply(400, {});
    return reply(200, { totalTokens: 900 });
  }
  if (!request.url.endsWith(':generateContent')) return reply(404, {});

  const context = JSON.parse(payload.contents[0].parts[0].text);
  const evaluation = Boolean(payload.generationConfig.responseJsonSchema.properties.overall_score);
  const answers = context.transcript.filter(({ speaker }) => speaker === 'learner').map(({ text }) => text);
  const fixture = answers.find((text) => text.includes('fixture-invalid-scorecard'));
  if (payload.generationConfig.maxOutputTokens !== (evaluation ? 1536 : 768) ||
      !context.curriculum.find(({ slug, publishedLesson }) => slug === 'prometheus' && publishedLesson) ||
      !context.rubric || context.curriculum.some(({ track }) => !context.tracks.includes(track))) {
    return reply(400, {});
  }
  const arabic = context.language === 'Arabic';
  let content = {
    question: arabic ? 'كيف تتحقق من هدف الجلب باستخدام `up`؟' :
      answers.length ? 'How would you verify recovery with `up`?' : 'How would you confirm that Prometheus can reach a scrape target using `up`?',
  };
  if (evaluation) {
    content = {
      overall_score: 45, technical_accuracy: 60, production_and_security_awareness: 35,
      missing_edge_cases: [arabic ? 'تحقق من غياب السلاسل الزمنية.' : 'Check for a missing series.',
        arabic ? 'ميّز بين تعطل الهدف وفشل الاتصال.' : 'Distinguish a down target from a failed network path.'],
      model_answer: arabic ? 'افحص نتائج الجلب باستخدام `up`.' : 'Inspect target health and verify recovery with `up`.\n\n```promql\nup{job="api"}\n```',
      weak_concept_slugs: ['prometheus', 'blackbox-exporter'],
    };
    if (fixture && !malformedEvaluations.has(fixture)) {
      malformedEvaluations.add(fixture);
      content.overall_score = '45';
    }
  }
  return reply(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(content) }] } }],
    usageMetadata: { promptTokenCount: 900, totalTokenCount: 977 } });
}).listen(3102, '127.0.0.1');
