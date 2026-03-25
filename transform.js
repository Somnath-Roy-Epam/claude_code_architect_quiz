const fs = require('fs');
const questions = require('./questions.js');

// Seeded RNG (Linear Congruential Generator)
function createRng(seed) {
  let s = Math.abs(seed) || 1;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Fisher-Yates shuffle with seeded RNG
function shuffleArray(arr, rng) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Enhancement maps for expanding short wrong options ───
// Each map entry: regex pattern on the short wrong text → array of expanded versions
const wrongExpansions = new Map([
  // Temperature / model params
  [/temperature/i, [
    "Adjust the temperature parameter to a lower value (e.g., 0.1) to reduce output randomness and improve response consistency across similar inputs",
    "Lower the temperature setting to near-zero to make the model produce more deterministic and predictable outputs for each request",
    "Fine-tune the temperature parameter based on task type, using lower values for factual tasks and higher values for creative generation",
  ]],
  [/max_tokens/i, [
    "Increase the max_tokens parameter to give the model more space for comprehensive responses with full detail and reasoning",
    "Set max_tokens to the maximum allowed value to ensure the model never truncates its output prematurely during generation",
    "Double the max_tokens allocation to allow for longer, more detailed responses that cover all aspects of the request",
  ]],
  // Context window
  [/larger context|200k context|context window/i, [
    "Switch to a model with a larger context window (e.g., 200k tokens) to accommodate the full conversation history without truncation",
    "Upgrade to the maximum available context window size so all conversation history and tool outputs fit without any loss",
    "Use a model variant with extended context capacity to handle long conversations and large tool outputs comfortably",
  ]],
  // Rename tools
  [/rename the tools/i, [
    "Rename the tools to use highly descriptive names that clearly convey their purpose, such as get_full_customer_profile vs get_order_tracking_status",
    "Use distinct, self-documenting tool names that differentiate functionality through naming conventions alone, without relying on descriptions",
    "Rename tools with verb-noun patterns (e.g., fetch_customer, search_orders) that make their purpose unambiguous from the name alone",
  ]],
  // Compress / compression
  [/compress/i, [
    "Apply compression algorithms to condense tool outputs and conversation history, preserving essential information in fewer tokens",
    "Use token-efficient compression on all tool outputs before adding them to context, trading some detail for reduced token consumption",
    "Implement automated output compression that reduces verbose tool results to a compact representation while retaining key data",
  ]],
  // Ask / tell the developer/user
  [/^ask (the |for |Claude|developer|user)/i, [
    "Ask the developer to provide detailed specifications and requirements before initiating any analysis or implementation work",
    "Request explicit guidance from the developer about the specific approach, constraints, and expected outcomes for the task",
    "Prompt the developer to clarify ambiguous requirements and specify priority areas before proceeding with automated analysis",
  ]],
  // Few-shot only / examples only
  [/few-shot|examples only/i, [
    "Rely solely on few-shot examples without any schema enforcement, allowing the model to infer the desired format from demonstrations",
    "Provide multiple demonstration examples covering various edge cases and let the model generalize the output format from those patterns",
    "Use a curated set of input-output examples as the primary guidance mechanism, without additional structural enforcement",
  ]],
  // Manual / manually
  [/^manual/i, [
    "Manually review and manage each instance through documented team procedures with regular audit checkpoints",
    "Handle the process manually through established team workflows with documented guidelines for consistency",
    "Perform manual review and intervention for each case, following documented procedures to ensure quality standards",
  ]],
  // Wiki / external doc
  [/wiki|external doc|google doc|confluence/i, [
    "Store documentation in a team wiki or Confluence page and instruct team members to manually reference it during development",
    "Maintain a centralized wiki with comprehensive guidelines and share the URL with team members for manual consultation",
    "Document standards in an external knowledge base (Confluence, Notion) and reference it from project README for discoverability",
  ]],
  // Retry all / retry same
  [/retry all|retry.*identic|resubmit.*entire/i, [
    "Retry all failed items with identical parameters, using exponential backoff to handle any transient infrastructure issues",
    "Resubmit the complete batch to ensure consistent processing, accepting the overhead of reprocessing successful items",
    "Re-run all failed operations with the same configuration, relying on retry logic to resolve intermittent failures",
  ]],
  // Discard / skip failures
  [/discard|skip (the |edge |fail)/i, [
    "Discard all failed items and continue with only the successfully processed results to maintain pipeline throughput",
    "Skip failed items entirely and process only the successful results, accepting some data loss for overall faster completion",
    "Remove failed items from the processing pipeline and work with the remaining successful results to meet deadlines",
  ]],
  // Throw exception
  [/throw exception|throw.*error/i, [
    "Throw a typed exception with descriptive message and stack trace, letting the calling code's catch block handle recovery logic",
    "Raise language-specific exceptions with custom error types that propagate through the call stack for centralized handling",
    "Throw an error with a descriptive message and error code, relying on the standard exception handling mechanism of the platform",
  ]],
  // HTTP status codes
  [/HTTP status|status codes/i, [
    "Return HTTP-style status codes (400 for client errors, 500 for server errors) with conventional JSON error bodies for categorization",
    "Use standard HTTP status codes with descriptive response bodies, leveraging established web conventions for error classification",
    "Return appropriate HTTP error codes with structured JSON bodies following REST API error conventions for consistent handling",
  ]],
  // Confidence scoring
  [/confidence scor/i, [
    "Implement automated confidence scoring with calibrated thresholds that route low-confidence responses to appropriate review queues",
    "Use a confidence scoring system with tuned thresholds derived from validation data to automatically categorize response reliability",
    "Deploy a confidence classifier that assigns numeric scores to each response and routes below-threshold cases for secondary review",
  ]],
  // Sentiment analysis
  [/sentiment/i, [
    "Use sentiment analysis on customer messages to detect frustration or confusion levels as triggers for automated escalation routing",
    "Implement NLP-based sentiment classification to identify negative emotional patterns and automatically route distressed conversations",
    "Deploy real-time sentiment detection that monitors conversation tone and triggers escalation when negativity exceeds defined thresholds",
  ]],
  // Simple error string / return error message
  [/return (error|simple|just).*string|error string|simple.*error|just.*error/i, [
    "Return a descriptive error message string with context about the failure, letting the consuming application parse and handle it",
    "Return a human-readable error message with sufficient detail for debugging, keeping error reporting simple and straightforward",
    "Return a plain text error description with the failure reason and any relevant identifiers for troubleshooting purposes",
  ]],
  // Separate / different repos
  [/separate repositor|different repositor/i, [
    "Split into separate repositories per service/document type with independent configuration and deployment pipelines",
    "Create individual repositories for each component, each with its own configuration and version-controlled conventions",
    "Maintain separate repositories with dedicated CLAUDE.md files, ensuring complete isolation between different service contexts",
  ]],
  // Use tool_choice
  [/tool_choice/i, [
    "Use the tool_choice parameter to force the model to use a specific tool, overriding the model's natural tool selection reasoning",
    "Set tool_choice to restrict which tools the model can invoke, maintaining explicit programmatic control over tool selection",
    "Configure tool_choice to direct the model toward specific tools based on the query context and expected operation type",
  ]],
  // Code comments
  [/code comment|inline comment/i, [
    "Add inline comments throughout the codebase with conventions and guidelines so Claude discovers them when reading relevant files",
    "Embed guidelines as structured code comments in strategic locations, allowing Claude to pick them up during normal code exploration",
    "Document standards as header comments in each file, providing context-specific guidance that Claude reads during file analysis",
  ]],
  // Post-process / post-generation
  [/post-process|post-generat|after generation/i, [
    "Apply a post-processing pipeline that validates, reformats, and normalizes the generated output to match required specifications",
    "Implement a post-generation validation and correction step that catches formatting issues and normalizes output structure",
    "Run a post-processing pass that transforms the raw model output into the expected format using deterministic rules",
  ]],
  // Parallel / simultaneously
  [/parallel.*api|parallel.*process|simultaneous/i, [
    "Use parallel synchronous API calls with connection pooling and rate limiting to maximize throughput during processing",
    "Process items concurrently using multiple API client instances with load balancing and intelligent rate limit management",
    "Run parallel synchronous processing with configurable concurrency limits and circuit-breaker patterns for resilience",
  ]],
  // Static analysis
  [/static analysis/i, [
    "Run automated static analysis tools via command line to detect code quality issues, complexity metrics, and potential vulnerabilities",
    "Use established static analysis frameworks (ESLint, SonarQube) to programmatically identify issues and generate structured reports",
    "Deploy static analysis scanners that check code against predefined rule sets and output machine-readable findings for integration",
  ]],
  // Linting rules
  [/linting|lint.*rule/i, [
    "Configure linting rules to enforce the desired patterns and reject non-conforming code during the build process automatically",
    "Use a comprehensive linting configuration that catches formatting and structural issues during development and CI/CD pipelines",
    "Implement custom linting rules that validate code against organizational standards and provide automated fix suggestions",
  ]],
  // Random / random sampling
  [/random|random samp/i, [
    "Use random sampling to process a representative subset of items, extrapolating findings to the full dataset statistically",
    "Apply random sampling with statistical confidence intervals to estimate overall quality from a manageable sample size",
    "Select a random representative sample for processing and use statistical methods to infer characteristics of the full set",
  ]],
  // All at once / everything simultaneously
  [/all (at once|simultaneous|files|tools)|everything/i, [
    "Process all items simultaneously in a single pass, leveraging the model's ability to handle multiple concerns in one context",
    "Handle everything in a single comprehensive operation, relying on the model to manage complexity and maintain consistency",
    "Execute all operations at once in parallel, accepting the overhead of concurrent processing for maximum throughput",
  ]],
  // One at a time / one by one
  [/one (at a time|by one)|sequentially|one test/i, [
    "Process each item individually in sequence, giving full attention to each one before moving to the next for maximum quality",
    "Handle items one at a time in strict sequential order, ensuring complete processing of each before starting the next",
    "Process each element sequentially with dedicated focus, trading throughput for thorough per-item analysis and validation",
  ]],
  // Restart / start over
  [/restart|start (from scratch|over|fresh)/i, [
    "Restart the entire process from scratch with a clean state, discarding any intermediate progress or partial results",
    "Reset to initial state and begin the process fresh, accepting the loss of any work completed in the current session",
    "Start over from the beginning with a new context, discarding accumulated history and any partial results obtained so far",
  ]],
  // Copy / copy-paste
  [/copy.*paste|copy into|duplicate/i, [
    "Copy the content into each project's configuration separately, using manual synchronization when updates are needed",
    "Maintain separate copies in each location, periodically checking for consistency and manually propagating any changes",
    "Duplicate the configuration across all relevant locations, establishing a manual sync process for ongoing maintenance",
  ]],
  // Email / verbal
  [/email|verbal|word of mouth/i, [
    "Communicate standards through team communication channels (email, Slack) and rely on team members to apply them consistently",
    "Share guidelines verbally during team meetings and document them in meeting notes for future reference by team members",
    "Distribute updates through email or team chat, with team members responsible for applying changes to their local setup",
  ]],
  // Simplify / simple
  [/simplif|pass\/fail|binary/i, [
    "Simplify the evaluation to a binary pass/fail classification, removing nuanced scoring in favor of clear actionable decisions",
    "Reduce complexity by using a simple pass/fail system with clear criteria, eliminating the ambiguity of multi-level ratings",
    "Use a simplified binary classification (acceptable/unacceptable) with explicitly documented boundary conditions for each",
  ]],
  // Not possible / not needed
  [/not possible|not needed|unnecessary|not required/i, [
    "This configuration is not supported by the current platform capabilities and requires alternative approaches to achieve",
    "This feature isn't available in the current implementation and would require custom development or third-party tooling",
    "This isn't needed for the described scenario as the default behavior already handles the requirements adequately",
  ]],
  // Trust / hope
  [/trust|hope for|accept|without/i, [
    "Trust the model's default behavior without additional validation, relying on its training to produce correct and consistent results",
    "Accept the current output quality without adding validation steps, relying on the model's inherent capabilities for accuracy",
    "Proceed without additional safeguards, trusting the foundational model capabilities to handle the requirements correctly",
  ]],
  // Empty results / ignore errors
  [/empty result|fail silent|ignore/i, [
    "Return empty results silently when errors occur, allowing the consuming application to interpret absence of data appropriately",
    "Fail silently without explicit error reporting, relying on the absence of results to signal an issue to downstream consumers",
    "Return an empty response set without error indicators, keeping the interface simple and letting callers handle missing data",
  ]],
  // Average / vote
  [/average|voting|multiple.*rating/i, [
    "Run the evaluation multiple times and average the scores to reduce variance and improve reliability of the final assessment",
    "Use an ensemble approach with multiple evaluations and statistical aggregation to reduce individual rating inconsistency",
    "Generate multiple independent ratings and use consensus or majority voting to determine the most reliable final assessment",
  ]],
  // Different model / larger model
  [/different model|larger model|better model|faster model/i, [
    "Switch to a more capable model variant that may handle the complexity better through improved reasoning and generation quality",
    "Upgrade to a larger or more advanced model with enhanced capabilities for handling complex multi-step reasoning tasks",
    "Use a specialized model variant optimized for this specific task type, leveraging domain-specific training improvements",
  ]],
  // Generate more / increase count
  [/generate more|more tests|more examples|more sources/i, [
    "Generate a larger volume of outputs to increase coverage through quantity, reviewing and filtering for quality after generation",
    "Increase the number of generated items to improve coverage probability, then apply quality filtering to the expanded set",
    "Produce more outputs and apply selection criteria to identify the highest quality results from the expanded generation pool",
  ]],
  // Detailed instructions
  [/detailed (instruction|prompt|format)|explicit instruction/i, [
    "Write comprehensive natural language instructions specifying exact requirements, edge cases, and expected behavior for all scenarios",
    "Add detailed step-by-step instructions in the system prompt covering format rules, ordering, and content requirements explicitly",
    "Provide extensive written instructions with explicit criteria, conditions, and formatting rules for every expected output scenario",
  ]],
  // No tools needed / not needed
  [/no tool|don't need|not.*needed/i, [
    "Rely on the model's built-in capabilities without additional tools, using prompt engineering alone to guide the behavior",
    "Handle everything through careful prompt design and instructions without introducing tool-based complexity to the workflow",
    "Use native model capabilities with well-crafted prompts rather than adding explicit tool interfaces for this functionality",
  ]],
  // Template / template files
  [/template|boilerplate/i, [
    "Create standardized template files with placeholder variables that developers fill in, enforcing structure through the template itself",
    "Use pre-built template files with documented sections and placeholders that guide generation toward consistent output patterns",
    "Maintain template files with structured sections and validation markers that ensure generated content follows the expected format",
  ]],
  // System prompt
  [/system prompt|prompt only/i, [
    "Configure everything through the system prompt with detailed instructions covering format, behavior, and edge case handling",
    "Rely on comprehensive system prompt instructions to guide model behavior, covering all expected scenarios and output formats",
    "Use system prompt configuration with explicit behavioral directives, formatting rules, and example-based guidance for consistency",
  ]],
  // Hardcode / hardcoded
  [/hardcode/i, [
    "Hardcode the values directly in the configuration file, keeping the setup simple and avoiding external dependency management",
    "Embed the credentials directly in the configuration for simplicity, with access restricted through file-system permissions",
    "Store values directly in the project configuration with clear documentation, using file access controls for security",
  ]],
  // Run indefinitely / no limit
  [/indefinit|no limit|unlimited/i, [
    "Allow the process to run without time constraints, letting it continue until completion regardless of elapsed time or resource usage",
    "Run without configured limits, trusting the process to complete naturally and relying on system-level resource management",
    "Let the operation proceed without timeout restrictions, accepting variable processing times for thorough and complete results",
  ]],
  // Default catch-all for remaining short options - matches common starters
  [/^(the|a |an |just|only|no,|yes,|it |for |same|skip|log|none|both|each|first|auto|two|three|not |this|they|run |one |keep)/i, [
    "Apply this approach with standard configuration, following established patterns and platform-recommended implementation conventions for the described scenario",
    "Implement this using the default approach with appropriate configuration for the team's development environment, tooling, and existing workflow documentation",
    "Use this method with proper team-standard configuration and validation steps to maintain consistency across the development and deployment process",
  ]],
  // Read all files
  [/read all files|read all/i, [
    "Read all files in the relevant directories upfront to build complete context before beginning any analysis or targeted investigation",
    "Load the complete contents of every file in the module into context for a comprehensive view before making any targeted assessments",
    "Use Read to ingest every file in the project, ensuring no code or configuration is missed during the exploration process",
  ]],
  // Use Bash
  [/use bash|bash.*command|bash.*to|run.*command/i, [
    "Use the Bash tool to run shell commands (grep, find, sed) for file-system-level operations and text processing outside the agent's built-in tools",
    "Execute the operation through Bash shell commands, leveraging standard Unix utilities for text processing and file manipulation directly",
    "Run the operation via Bash with appropriate command-line tools (awk, sed, grep) that provide powerful text processing capabilities",
  ]],
  // Too many / too much
  [/too many|too much|too complex|too large/i, [
    "The scale of the task exceeds practical limits; reduce the scope by focusing on the most critical subset of items for processing",
    "The volume is too high for single-pass processing; implement pagination or chunking to handle manageable subsets sequentially",
    "The complexity requires decomposition; break down the task into smaller, focused subtasks that can be handled individually",
  ]],
  // Format issues / formatting
  [/format issue|formatting|format problem/i, [
    "The root cause is likely formatting-related; apply a dedicated formatting tool or linter to enforce consistent output structure",
    "Investigate and fix the underlying format specification to ensure all output conforms to the expected structure and conventions",
    "Apply formatting normalization as a post-processing step to transform any format variations into the required standard output",
  ]],
  // Return exit code
  [/exit code|return code|status code.*only/i, [
    "Return only the numeric exit code from the process, letting the calling code interpret success/failure from standard conventions",
    "Use the process exit code to signal success (0) or failure (non-zero) following standard Unix command-line conventions",
    "Return a simple numeric status code with platform-standard meaning, keeping the error reporting interface minimal and portable",
  ]],
  // Model needs / model should
  [/model needs|model.*fine-tun|agent needs/i, [
    "Fine-tune or train a specialized model variant on domain-specific data to improve performance on this particular task category",
    "Upgrade the model to a more capable version with enhanced reasoning abilities specifically suited for this type of operation",
    "Use a domain-specialized model that has been optimized for this specific task type through targeted training and evaluation",
  ]],
  // Natural language / unstructured
  [/natural language|unstructured|free.?text/i, [
    "Use natural language processing with flexible output interpretation, parsing the model's free-text response into structured data programmatically",
    "Accept free-form natural language output and implement robust parsing to extract structured data fields from the text response",
    "Rely on natural language generation without structural constraints, using post-processing regex and NLP to normalize the output",
  ]],
  // System level / system path
  [/system.?level|system path|global.*install/i, [
    "Install at the system level for global availability across all users and projects on the machine, using standard package manager paths",
    "Configure at the operating system level through system-wide configuration files that apply to all users and development environments",
    "Use system-wide installation paths to make the tool available to all users, with centralized configuration management and updates",
  ]],
  // Developer responsibility
  [/developer.*responsib|human.*responsib|user.*decide/i, [
    "Leave this as the developer's responsibility to handle manually, documenting the expected approach in the team's workflow guidelines",
    "Rely on individual developers to manage this through their standard workflow, with code review as the quality backstop for consistency",
    "Make this a manual developer task with clear documentation, trusting team members to follow established procedures consistently",
  ]],
  // In code / code-level
  [/in (the )?code|code.*comments?/i, [
    "Embed the information directly in the codebase through strategic comments and documentation that the model encounters during code reading",
    "Add inline documentation throughout the code using structured comment formats that provide context-specific guidance for each module",
    "Document everything through code-level comments and in-file documentation, making guidance discoverable through normal code exploration",
  ]],
  // Reduce / fewer
  [/reduce.*scope|review fewer|fewer files|limit to|reduce/i, [
    "Reduce the scope to only the most critical items, accepting that some lower-priority items may not receive thorough analysis",
    "Limit processing to a smaller, focused subset of the most important items to maintain quality within resource constraints",
    "Focus on a manageable number of high-priority items, deferring lower-priority analysis to subsequent iterations or manual review",
  ]],
  // Separate / split into
  [/^separate |^split (into|by )|^create separate/i, [
    "Split the operation into separate isolated components, each with its own configuration, processing pipeline, and output handling",
    "Create separate instances for each category with independent configuration, allowing specialized handling for different types",
    "Maintain separate implementations for each variant, with dedicated configuration and validation rules per implementation path",
  ]],
  // Depends / it depends
  [/depends|varies|case.?by.?case/i, [
    "The approach depends on the specific context and requirements; evaluate each situation individually based on the particular constraints",
    "This varies by implementation context and team needs; assess the specific situation to determine the most appropriate approach",
    "Apply a case-by-case evaluation considering the specific constraints, requirements, and potential impact of each unique situation",
  ]],
  // Combine / merge / consolidate
  [/combine|merge|consolidat/i, [
    "Consolidate all related functionality into a single unified component, reducing the number of interfaces but increasing per-component complexity",
    "Merge related capabilities into combined tools with mode parameters, simplifying the tool landscape but adding parameter complexity",
    "Combine similar components into a unified implementation with comprehensive parameter sets that cover all original use cases",
  ]],
  // Permissions / access control
  [/permission|access control|authorization/i, [
    "Implement granular access controls with role-based permissions that restrict tool access based on user identity and team membership",
    "Use the platform's built-in permission system to control access at the user and team level through configuration-based authorization",
    "Set up access control lists (ACLs) that define which users and roles can invoke specific tools based on organizational hierarchy",
  ]],
  // Environment variables
  [/environment variable|env.*var/i, [
    "Store credentials and configuration in environment variables, using the system's environment management for secure access and rotation",
    "Use environment variables for all sensitive configuration, with proper scoping and documentation for each development environment",
    "Configure all settings through environment variables with clear naming conventions and documentation for team member setup",
  ]],
  // File-system / directory level
  [/directory|file.*system|folder/i, [
    "Create separate configuration in each directory, maintaining independent settings that apply only to files within that specific path",
    "Use directory-level configuration files that provide localized settings, with inheritance from parent directories for shared defaults",
    "Organize configuration by directory structure, with each folder maintaining its own settings that override parent-level defaults",
  ]],
]);

// Enhancement function for short wrong options
function enhanceWrongOption(wrongText, correctText, questionText, optionKey, questionId) {
  const correctLen = correctText.length;
  const wrongLen = wrongText.length;

  // If wrong option is already >= 90% of correct length, leave it as-is
  if (wrongLen >= correctLen * 0.90) return wrongText;

  // Try to match against expansion patterns (check the wrong option text)
  for (const [pattern, expansions] of wrongExpansions) {
    if (pattern.test(wrongText)) {
      const idx = (questionId + optionKey.charCodeAt(0)) % expansions.length;
      return expansions[idx];
    }
  }

  // ── Context-aware fallback based on QUESTION text ──
  // These are longer, more plausible wrong alternatives based on the question topic
  if (/tool.*description|tool.*select|wrong tool|similar.*tool/i.test(questionText)) {
    const alts = [
      "Consolidate the overlapping tools into a single unified tool with a mode parameter that specifies the operation type to reduce selection complexity",
      "Add detailed routing instructions in the system prompt specifying exactly which tool to use for each category of user request",
      "Rename each tool with descriptive prefixes and suffixes that clearly indicate their scope, input requirements, and output formats",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/error.*handl|tool.*fail|tool.*error|timeout|retry/i.test(questionText)) {
    const alts = [
      "Implement global retry logic with exponential backoff that automatically retries all failed operations regardless of error type",
      "Return descriptive error strings with human-readable messages and let the consuming code determine the appropriate handling strategy",
      "Log all errors to a centralized monitoring system and return a generic failure response to the agent for consistent handling",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/CLAUDE\.md|configuration|config.*team|standard|convention|guideline/i.test(questionText)) {
    const alts = [
      "Create comprehensive documentation in the team wiki with detailed guidelines and share the link with all team members for reference",
      "Configure this in each developer's user-level ~/.claude/CLAUDE.md to ensure personal context is applied across all their projects",
      "Add inline comments throughout the codebase explaining the conventions, so Claude discovers them naturally during file exploration",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/MCP.*server|\.mcp\.json|server.*config/i.test(questionText)) {
    const alts = [
      "Configure each MCP server in user-level ~/.claude.json with personal API credentials and server connection parameters",
      "Create separate configuration files for each MCP server and load them individually through environment-specific startup scripts",
      "Register servers through a centralized service registry that manages discovery and connection for all team development environments",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/review|PR |pull request|code quality|finding/i.test(questionText)) {
    const alts = [
      "Use comprehensive natural language instructions specifying review criteria, with explicit rules for each code quality dimension",
      "Implement automated static analysis tools that generate structured reports and integrate with the CI pipeline for each commit",
      "Focus review on only the most critical files (entry points, public APIs) and skip infrastructure, test, and utility code changes",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/CI|pipeline|automat|non-interactive|--print/i.test(questionText)) {
    const alts = [
      "Configure the CI environment with the appropriate toolchain and run automated checks using platform-native analysis tools",
      "Implement the review in a separate CI job with its own runner configuration, environment variables, and timeout settings",
      "Use automated code analysis frameworks (ESLint, SonarQube, etc.) that integrate natively with the CI pipeline infrastructure",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/extract|document.*process|invoice|receipt|schema/i.test(questionText)) {
    const alts = [
      "Implement detailed natural language extraction instructions with explicit field definitions and format specifications in the prompt",
      "Use a pre-trained document understanding model that handles format detection and field mapping through visual layout analysis",
      "Build a rule-based extraction pipeline using regex patterns and template matching customized for each document format type",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/multi-agent|coordinator|subagent|delegat/i.test(questionText)) {
    const alts = [
      "Allow subagents to communicate directly with each other through a shared event bus, reducing coordinator bottleneck overhead",
      "Implement a shared memory store accessible by all agents where they can read and write findings without central coordination",
      "Use a pipeline architecture where each agent processes sequentially, passing output directly to the next agent in the chain",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/context.*fill|context.*full|long.*conversation|token|context.*manage/i.test(questionText)) {
    const alts = [
      "Switch to the largest available context window model to accommodate all accumulated history without any truncation or summarization",
      "Implement an external database for conversation storage and retrieve relevant segments on demand using semantic search queries",
      "Process each request independently with minimal history, relying on the user to re-provide relevant context when needed",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/escalat|human.*review|human.*agent/i.test(questionText)) {
    const alts = [
      "Implement automated confidence scoring with calibrated thresholds that route below-threshold responses to human review queues",
      "Count the number of tool calls or conversation turns and trigger escalation when a configurable maximum limit is exceeded",
      "Use sentiment analysis on user messages to detect frustration patterns and automatically route negative conversations to reviewers",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/consistency|inconsisten|varies|variable|format.*inconsis/i.test(questionText)) {
    const alts = [
      "Add comprehensive natural language instructions with explicit formatting rules and criteria covering all expected output scenarios",
      "Implement a post-processing validation pipeline that normalizes and reformats all generated output to match the required standard",
      "Use multiple generation passes with comparison logic to select the most consistent output from several candidate responses",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/batch|overnight|latency.*tolerant|500.*email|100.*document/i.test(questionText)) {
    const alts = [
      "Use parallel synchronous API calls with connection pooling and rate limiting to maximize throughput during batch processing",
      "Implement streaming API calls for each item, processing responses incrementally as they arrive for high-throughput situations",
      "Set up a queue-based processing system with dedicated workers handling items synchronously with automatic load balancing",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/exploration|codebase|analyz.*code|understand.*module/i.test(questionText)) {
    const alts = [
      "Read all files in the target directory upfront to build complete understanding before beginning any analysis or modification",
      "Use the Bash tool to run external code analysis tools that generate comprehensive reports about the codebase structure",
      "Generate a directory listing and read file headers (imports, exports) to map the codebase structure before deep analysis",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/test.*generation|generate.*test|test.*quality|test.*structure/i.test(questionText)) {
    const alts = [
      "Generate all tests in a single comprehensive prompt with detailed instructions for coverage, naming, and structure requirements",
      "Use automated test generation frameworks (property-based testing, mutation testing) that programmatically create test scenarios",
      "Create a test template file with placeholder sections and use it as the starting point for all generated test implementations",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/refactor|migration|modify.*file|multi.*file|large.*change/i.test(questionText)) {
    const alts = [
      "Proceed with direct execution, implementing changes file by file based on the initial understanding of the requirements",
      "Start with a prototype implementation in one representative file and validate the approach before extending to other files",
      "Use automated refactoring tools through the Bash command to apply mechanical transformations across all affected source files",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }
  if (/session|memory|persist|fork|branch/i.test(questionText)) {
    const alts = [
      "Use version control (git) to create branches for each exploration path, allowing rollback through standard git operations",
      "Save intermediate states to checkpoint files on disk, allowing manual restoration of previous states when needed",
      "Keep all exploration paths in the main conversation context, using clear markers to distinguish between different approaches",
    ];
    return alts[(questionId + optionKey.charCodeAt(0)) % alts.length];
  }

  // ── Last resort: transform the short option into a more detailed version ──
  // by appending topic-aware context
  const suffixes = [
    ", with proper monitoring and validation throughout the process to ensure reliability and correctness of the implementation",
    ", implementing appropriate guardrails and verification steps to maintain quality standards across the entire workflow",
    ", ensuring consistency through standardized processes and documented team procedures for reproducible results",
    ", following established best practices and organizational standards for this type of operation and deployment context",
  ];
  const suffixIdx = (questionId + optionKey.charCodeAt(0)) % suffixes.length;
  return wrongText + suffixes[suffixIdx];
}

// Process each question
const letters = ['A', 'B', 'C', 'D'];
const transformed = questions.map(q => {
  const rng = createRng(q.id * 43 + 280);

  // Step 1: Enhance wrong options
  const enhancedOptions = {};
  for (const letter of letters) {
    if (letter === q.correctAnswer) {
      enhancedOptions[letter] = q.options[letter];
    } else {
      enhancedOptions[letter] = enhanceWrongOption(
        q.options[letter],
        q.options[q.correctAnswer],
        q.question,
        letter,
        q.id
      );
    }
  }

  // Step 2: Shuffle option positions
  const shuffledKeys = shuffleArray(letters, rng);
  // shuffledKeys[i] is the OLD letter that goes to NEW position i
  const newOptions = {};
  const mapping = {}; // old letter -> new letter
  for (let i = 0; i < 4; i++) {
    const newLetter = letters[i];
    const oldLetter = shuffledKeys[i];
    newOptions[newLetter] = enhancedOptions[oldLetter];
    mapping[oldLetter] = newLetter;
  }

  const newCorrect = mapping[q.correctAnswer];

  return {
    id: q.id,
    question: q.question,
    options: newOptions,
    correctAnswer: newCorrect,
    explanation: q.explanation,
  };
});

// ── Verify metrics ──
const dist = { A: 0, B: 0, C: 0, D: 0 };
transformed.forEach(q => dist[q.correctAnswer]++);
console.log('Answer distribution:', dist);

let longestCorrect = 0;
transformed.forEach(q => {
  const lens = Object.entries(q.options).map(([k, v]) => [k, v.length]);
  lens.sort((a, b) => b[1] - a[1]);
  if (lens[0][0] === q.correctAnswer) longestCorrect++;
});
console.log('Longest is correct:', longestCorrect, '/', transformed.length,
  '=', Math.round(longestCorrect / transformed.length * 100) + '%');

// Avg length stats
let correctLens = [], wrongLens = [];
transformed.forEach(q => {
  correctLens.push(q.options[q.correctAnswer].length);
  Object.keys(q.options).filter(k => k !== q.correctAnswer).forEach(k =>
    wrongLens.push(q.options[k].length)
  );
});
console.log('Avg correct length:', Math.round(correctLens.reduce((a, b) => a + b) / correctLens.length));
console.log('Avg wrong length:', Math.round(wrongLens.reduce((a, b) => a + b) / wrongLens.length));

// ── Write output ──
let output = 'module.exports = [\n';
transformed.forEach((q, i) => {
  output += '  {\n';
  output += `    id: ${q.id},\n`;
  output += `    question: ${JSON.stringify(q.question)},\n`;
  output += '    options: {\n';
  for (const letter of letters) {
    output += `      ${letter}: ${JSON.stringify(q.options[letter])},\n`;
  }
  output += '    },\n';
  output += `    correctAnswer: ${JSON.stringify(q.correctAnswer)},\n`;
  output += `    explanation: ${JSON.stringify(q.explanation)},\n`;
  output += '  },\n';
});
output += '];\n';

fs.writeFileSync('questions.js', output, 'utf8');
console.log('✓ Written to questions.js (' + transformed.length + ' questions)');
