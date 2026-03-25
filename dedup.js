const fs = require('fs');
const questions = require('./questions.js');

// ========== BROAD TOPIC CLASSIFICATION (keep 1-2 per topic) ==========
function classifyQuestion(q) {
  const t = q.question.toLowerCase();

  // DOMAIN 1: Agentic Architecture & Orchestration
  if (t.includes('stop_reason') && t.includes('tool_use')) return 'D1_stop_reason_tool_use';
  if (t.includes('stop_reason') && t.includes('end_turn')) return 'D1_stop_reason_end_turn';
  if (t.includes('stop_reason') && !t.includes('tool_use') && !t.includes('end_turn')) return 'D1_stop_reason_other';
  if (t.includes('agentic loop') || t.includes('agent loop')) {
    if (t.includes('terminat') || t.includes('never')) return 'D1_loop_termination';
    if (t.includes('context') || t.includes('history')) return 'D1_loop_context';
    return 'D1_loop_general';
  }
  if (t.includes('pretooluse') || t.includes('posttooluse') || t.includes('pre-tool') || t.includes('post-tool') || (t.includes('hook') && t.includes('tool'))) return 'D1_tool_hooks';
  if (t.includes('multi-agent') || t.includes('coordinator') || t.includes('subagent') || t.includes('delegate')) {
    if (t.includes('error') || t.includes('fail')) return 'D1_multiagent_errors';
    if (t.includes('task') && t.includes('decompos')) return 'D1_multiagent_decomposition';
    if (t.includes('track') || t.includes('attribution')) return 'D1_multiagent_tracking';
    if (t.includes('session') || t.includes('context') || t.includes('token')) return 'D1_multiagent_context';
    return 'D1_multiagent_general';
  }
  if (t.includes('escalat')) {
    if (t.includes('ci') || t.includes('review')) return 'D5_ci_escalation';
    return 'D1_escalation';
  }
  if (t.includes('parallel tool') || t.includes('parallel execution')) return 'D1_parallel_tools';
  if ((t.includes('sequential') || t.includes('three') && t.includes('operation')) && t.includes('tool')) return 'D1_sequential_tools';
  if (t.includes('refund') && t.includes('manager') || t.includes('approval')) return 'D1_business_rules';
  if (t.includes('simple') && t.includes('complex') && t.includes('request')) return 'D1_request_routing';
  if (t.includes('tool') && (t.includes('5-15 second') || t.includes('slow') || t.includes('long-running'))) return 'D1_tool_latency';
  if (t.includes('tool') && t.includes('pattern') && (t.includes('repeated') || t.includes('redundant'))) return 'D1_tool_loop_pattern';

  // DOMAIN 2: Tool Design & MCP Integration
  if (t.includes('mcp')) {
    if (t.includes('.mcp.json') || t.includes('configure') || t.includes('configuration')) return 'D2_mcp_config';
    if (t.includes('api key') || t.includes('credential') || t.includes('authentication') || t.includes('personal')) return 'D2_mcp_auth';
    if (t.includes('description') || t.includes('overlap') || t.includes('similar')) return 'D2_mcp_tool_descriptions';
    if (t.includes('fail') || t.includes('error') || t.includes('timeout')) return 'D2_mcp_error_handling';
    if (t.includes('verbose') || t.includes('output') || t.includes('return')) return 'D2_mcp_output';
    if (t.includes('restrict') || t.includes('only') || t.includes('branch')) return 'D2_mcp_restrictions';
    return 'D2_mcp_general';
  }
  if ((t.includes('tool_description') || t.includes('tool description')) && (t.includes('similar') || t.includes('overlap'))) return 'D2_tool_desc_overlap';
  if (t.includes('tool_description') || t.includes('tool description')) return 'D2_tool_description';
  if (t.includes('tool') && (t.includes('40+') || t.includes('field') && t.includes('return'))) return 'D2_tool_output_filtering';
  if (t.includes('how many tool') || t.includes('18 tool') || t.includes('too many tool')) return 'D2_tool_count';
  if (t.includes('search') && t.includes('tool') && t.includes('parameter')) return 'D2_tool_design';

  // DOMAIN 3: Claude Code Configuration & Workflows
  if (t.includes('claude code')) {
    if (t.includes('non-interactive') || t.includes('--print')) return 'D3_claude_code_noninteractive';
    if (t.includes('skill') || t.includes('fork')) return 'D3_claude_code_skills';
    if (t.includes('plan mode')) return 'D3_claude_code_plan_mode';
    if (t.includes('read') || t.includes('grep') || t.includes('glob') || t.includes('bash')) return 'D3_claude_code_builtin_tools';
    if (t.includes('edit') && t.includes('fail')) return 'D3_claude_code_edit';
    if (t.includes('refactor')) return 'D3_claude_code_refactoring';
    if (t.includes('test')) return 'D3_claude_code_testing';
    if (t.includes('review') || t.includes('pr ')) return 'D3_claude_code_review';
    if (t.includes('escalat')) return 'D3_claude_code_escalation';
    if (t.includes('context') || t.includes('150 files') || t.includes('200+ files') || t.includes('large codebase')) return 'D3_claude_code_context';
    if (t.includes('user-level') || t.includes('configuration')) return 'D3_claude_code_config';
    return 'D3_claude_code_general';
  }
  if (t.includes('claude.md') || t.includes('claude_md')) {
    if (t.includes('sensitive') || t.includes('public') || t.includes('api endpoint')) return 'D3_claude_md_security';
    if (t.includes('grown') || t.includes('2500') || t.includes('3000') || t.includes('1800')) return 'D3_claude_md_size';
    if (t.includes('shared') || t.includes('across') || t.includes('multiple project')) return 'D3_claude_md_shared';
    return 'D3_claude_md_general';
  }
  if (t.includes('custom command') || t.includes('/check_') || t.includes('/run-') || t.includes('/review-') || t.includes('/cite') || t.includes('/validate')) return 'D3_custom_commands';
  if (t.includes('skill') && t.includes('frontmatter') || t.includes('context: fork')) return 'D3_skill_config';

  // DOMAIN 4: Prompt Engineering & Structured Output
  if (t.includes('extract')) {
    if (t.includes('invoice') && (t.includes('line item') || t.includes('schema') || t.includes('field'))) return 'D4_extract_invoice_schema';
    if (t.includes('invoice') && (t.includes('format') || t.includes('currency') || t.includes('date'))) return 'D4_extract_invoice_format';
    if (t.includes('invoice') && (t.includes('wrong') || t.includes('confus'))) return 'D4_extract_invoice_errors';
    if (t.includes('invoice')) return 'D4_extract_invoice_general';
    if (t.includes('validation') || t.includes('validate') || t.includes('retry')) return 'D4_extract_validation';
    if (t.includes('hallucin') || t.includes('fabricat') || t.includes('placeholder') || t.includes('doesn\'t exist')) return 'D4_extract_hallucination';
    if (t.includes('provenance') || t.includes('which document')) return 'D4_extract_provenance';
    if (t.includes('confidence') || t.includes('score')) return 'D4_extract_confidence';
    if (t.includes('pii') || t.includes('personal information')) return 'D4_extract_pii';
    if (t.includes('edge case') || t.includes('handwritten') || t.includes('poor image') || t.includes('blurry')) return 'D4_extract_edge_cases';
    if (t.includes('batch') || t.includes('thousand') || t.includes('100')) return 'D4_extract_batch';
    if (t.includes('multilingual') || t.includes('language') || t.includes('english') || t.includes('spanish')) return 'D4_extract_multilingual';
    if (t.includes('schema')) return 'D4_extract_schema';
    return 'D4_extraction_general';
  }
  if (t.includes('json') && t.includes('schema') && !t.includes('ci')) return 'D4_json_schema';
  if (t.includes('few-shot') || t.includes('few shot')) return 'D4_few_shot';
  if (t.includes('temperature')) return 'D4_temperature';
  if (t.includes('max_tokens')) return 'D4_max_tokens';
  if (t.includes('classification') || t.includes('classify')) return 'D4_classification';
  if (t.includes('sentiment')) return 'D4_sentiment';
  if (t.includes('summariz')) return 'D4_summarization';
  if (t.includes('structured') && (t.includes('output') || t.includes('data') || t.includes('format'))) return 'D4_structured_output';
  if (t.includes('citation') && t.includes('format')) return 'D4_citation_format';
  if (t.includes('citation') || t.includes('source attribution')) return 'D4_citations';
  if (t.includes('inconsisten') && (t.includes('format') || t.includes('output') || t.includes('quality') || t.includes('response'))) return 'D4_consistency';
  if (t.includes('rating') && t.includes('inconsisten') || t.includes('quality') && t.includes('1-5')) return 'D4_rating_consistency';

  // DOMAIN 5: Context Management & Reliability
  if (t.includes('context window') || t.includes('context limit') || (t.includes('context') && t.includes('exceed'))) return 'D5_context_window';
  if (t.includes('prompt cach')) return 'D5_prompt_caching';
  if (t.includes('session') || t.includes('conversation history') || t.includes('conversation memory')) return 'D5_session_management';
  if (t.includes('confidence') && t.includes('scor')) return 'D5_confidence_scoring';
  if (t.includes('batch') && t.includes('api')) return 'D5_batch_api';
  if (t.includes('batch') && (t.includes('process') || t.includes('overnight'))) return 'D5_batch_processing';
  if (t.includes('tool_choice')) return 'D5_tool_choice';
  if (t.includes('vision') || (t.includes('image') && !t.includes('imagine'))) return 'D5_vision';

  // CI/CD REVIEW  
  if (t.includes('ci') || t.includes('pipeline') || t.includes('github action') || (t.includes('pr ') && t.includes('review')) || t.includes('automated review')) {
    if (t.includes('false positive') || t.includes('acceptable')) return 'D5_ci_false_positives';
    if (t.includes('inconsisten')) return 'D5_ci_consistency';
    if (t.includes('prioritiz') || t.includes('overwhelm') || t.includes('categoriz')) return 'D5_ci_prioritization';
    if (t.includes('large') || t.includes('30-file') || t.includes('20-file') || t.includes('superficial')) return 'D5_ci_large_pr';
    if (t.includes('monorepo')) return 'D5_ci_monorepo';
    if (t.includes('context') || t.includes('token') || t.includes('exceed')) return 'D5_ci_context';
    if (t.includes('track') || t.includes('trend')) return 'D5_ci_tracking';
    if (t.includes('standard') || t.includes('convention') || t.includes('criteria') || t.includes('where')) return 'D5_ci_standards';
    if (t.includes('json') || t.includes('schema') || t.includes('output')) return 'D5_ci_output_format';
    if (t.includes('security')) return 'D5_ci_security';
    if (t.includes('branch')) return 'D5_ci_branches';
    if (t.includes('cost') || t.includes('every commit')) return 'D5_ci_cost';
    return 'D5_ci_general';
  }

  // ERROR HANDLING (catch-all for remaining error questions)
  if (t.includes('error') || t.includes('fail') || t.includes('timeout') || t.includes('retry')) return 'D1_error_handling';
  
  // REMAINING catch-alls
  if (t.includes('refactor')) return 'D3_refactoring';
  if (t.includes('test') && (t.includes('generat') || t.includes('writing'))) return 'D3_test_generation';
  if (t.includes('code review') || t.includes('review') && t.includes('pr')) return 'D5_code_review';
  if (t.includes('security') || t.includes('credential')) return 'D5_security';
  if (t.includes('convention') || t.includes('style guide') || t.includes('standards')) return 'D3_coding_standards';
  if (t.includes('research') || t.includes('finding') || t.includes('synthesis')) return 'D1_research_system';
  if (t.includes('customer') || t.includes('refund') || t.includes('order') || t.includes('support')) return 'D1_customer_ops';
  if (t.includes('documentation') || t.includes('document all')) return 'D3_documentation';
  if (t.includes('cost') || t.includes('pricing')) return 'D5_cost';
  if (t.includes('boilerplate')) return 'D4_boilerplate';
  if (t.includes('migration') || t.includes('database')) return 'D4_database_migration';
  if (t.includes('rename')) return 'D3_code_rename';
  if (t.includes('unfamiliar') || t.includes('doesn\'t recognize')) return 'D3_unknown_patterns';
  if (t.includes('ambiguous') || t.includes('vague')) return 'D4_ambiguous_requests';
  if (t.includes('bug') || t.includes('debug') || t.includes('tracing')) return 'D3_debugging';
  if (t.includes('state machine') || t.includes('complex module')) return 'D3_complex_code';

  return 'OTHER_' + q.id;
}

// ========== CLASSIFY ALL QUESTIONS ==========
const grouped = {};
questions.forEach(q => {
  const topic = classifyQuestion(q);
  if (!grouped[topic]) grouped[topic] = [];
  grouped[topic].push(q);
});

// ========== PICK BEST 1-2 PER TOPIC ==========
function pickBest(questions, max) {
  if (questions.length <= max) return questions;
  
  // Prefer questions with longer, more scenario-based question text
  const scored = questions.map(q => ({
    q,
    score: q.question.length + (q.question.includes('?') ? 10 : 0) + (q.question.includes('scenario') ? 20 : 0)
  }));
  scored.sort((a, b) => b.score - a.score);

  // Pick most different pair if max=2
  if (max === 2 && scored.length >= 2) {
    // Pick the top one, then find the one most different from it
    const first = scored[0];
    let bestIdx = 1, bestDiff = 0;
    const firstWords = new Set(first.q.question.toLowerCase().split(/\W+/));
    for (let i = 1; i < scored.length; i++) {
      const words = new Set(scored[i].q.question.toLowerCase().split(/\W+/));
      const overlap = [...firstWords].filter(w => words.has(w)).length;
      const diff = firstWords.size + words.size - 2 * overlap;
      if (diff > bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    return [first.q, scored[bestIdx].q];
  }

  return scored.slice(0, max).map(s => s.q);
}

// ========== SELECT ==========
const kept = [];
const topicReport = [];

Object.entries(grouped).sort((a, b) => b[1].length - a[1].length).forEach(([topic, qs]) => {
  const max = qs.length >= 4 ? 2 : (qs.length >= 2 ? 1 : 1);
  const selected = pickBest(qs, max);
  selected.forEach(q => kept.push(q));
  topicReport.push({ topic, total: qs.length, kept: selected.length, ids: selected.map(q => q.id) });
});

console.log('\n=== DEDUPLICATION REPORT ===');
console.log('Original:', questions.length, 'questions');
console.log('After dedup:', kept.length, 'questions');
console.log('\nTopics with most duplicates removed:');
topicReport.filter(t => t.total > 2).sort((a, b) => b.total - a.total).forEach(t => {
  console.log(`  ${t.topic}: ${t.total} → ${t.kept} (kept Q${t.ids.join(', Q')})`);
});
console.log('\nTopics kept as-is (1-2 questions):');
topicReport.filter(t => t.total <= 2).forEach(t => {
  console.log(`  ${t.topic}: ${t.total}`);
});

// ========== ASSIGN DOMAINS BASED ON TOPIC ==========
function assignDomain(topic) {
  if (topic.startsWith('D1_')) return 1;
  if (topic.startsWith('D2_')) return 2;
  if (topic.startsWith('D3_')) return 3;
  if (topic.startsWith('D4_')) return 4;
  if (topic.startsWith('D5_')) return 5;
  // Other/unclassified - assign to domain based on question content
  return 4; // Default to Prompt Engineering
}

// Sort by domain, then by original ID within domain
const domainGroups = { 1: [], 2: [], 3: [], 4: [], 5: [] };
kept.forEach(q => {
  const topic = classifyQuestion(q);
  const domain = assignDomain(topic);
  domainGroups[domain].push(q);
});

// Sort within each domain by original ID
for (const d in domainGroups) {
  domainGroups[d].sort((a, b) => a.id - b.id);
}

console.log('\nDomain distribution:');
for (const d in domainGroups) {
  console.log(`  Domain ${d}: ${domainGroups[d].length} questions`);
}

// Build final ordered array: Domain1, Domain2, Domain3, Domain4, Domain5
const final = [];
for (let d = 1; d <= 5; d++) {
  domainGroups[d].forEach(q => final.push(q));
}

// Renumber sequentially
final.forEach((q, i) => { q.id = i + 1; });

console.log('Total final questions:', final.length);

// Compute domain boundaries for getDomain function
const boundaries = [];
let cumulative = 0;
for (let d = 1; d <= 5; d++) {
  cumulative += domainGroups[d].length;
  boundaries.push(cumulative);
}
console.log('\nDomain boundaries (cumulative):', boundaries);
console.log('getDomain logic:');
console.log(`  if (id <= ${boundaries[0]}) return 1;`);
console.log(`  if (id <= ${boundaries[1]}) return 2;`);
console.log(`  if (id <= ${boundaries[2]}) return 3;`);
console.log(`  if (id <= ${boundaries[3]}) return 4;`);
console.log(`  return 5;`);

// ========== WRITE OUTPUT ==========
const lines = ['module.exports = ['];
final.forEach((q, i) => {
  lines.push('  {');
  lines.push(`    id: ${q.id},`);
  lines.push(`    question: ${JSON.stringify(q.question)},`);
  lines.push('    options: {');
  lines.push(`      A: ${JSON.stringify(q.options.A)},`);
  lines.push(`      B: ${JSON.stringify(q.options.B)},`);
  lines.push(`      C: ${JSON.stringify(q.options.C)},`);
  lines.push(`      D: ${JSON.stringify(q.options.D)},`);
  lines.push('    },');
  lines.push(`    correctAnswer: ${JSON.stringify(q.correctAnswer)},`);
  lines.push(`    explanation: ${JSON.stringify(q.explanation)},`);
  lines.push('  },');
});
lines.push('];');
lines.push('');

fs.writeFileSync('questions.js', lines.join('\n'), 'utf8');
console.log('\n✓ Written to questions.js (' + final.length + ' questions)');

// Verify answer distribution
const dist = { A: 0, B: 0, C: 0, D: 0 };
final.forEach(q => dist[q.correctAnswer]++);
console.log('Answer distribution:', dist);

// Check longest-is-correct ratio
let longestCorrect = 0;
final.forEach(q => {
  const keys = ['A', 'B', 'C', 'D'];
  const lens = keys.map(k => q.options[k].length);
  const maxLen = Math.max(...lens);
  const correctLen = q.options[q.correctAnswer].length;
  if (correctLen >= maxLen) longestCorrect++;
});
console.log('Longest is correct:', longestCorrect, '/', final.length, '=', (longestCorrect / final.length * 100).toFixed(1) + '%');
