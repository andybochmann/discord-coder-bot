/**
 * Utility functions for detecting and handling planning requests.
 * The planning phase allows the agent to outline its approach before executing,
 * giving users a chance to provide feedback.
 */

/**
 * Patterns that indicate the user wants a planning phase before execution.
 * These patterns are case-insensitive.
 */
const PLANNING_PATTERNS: RegExp[] = [
  /\bplan\s*(this\s+)?(first|out|it)\b/i,
  /\bcreate\s+(a\s+)?plan\b/i,
  /\boutline\s+(the\s+)?(approach|steps|plan)\b/i,
  /\bwhat('s|\s+is)\s+your\s+plan\b/i,
  /\bshow\s+(me\s+)?(the\s+)?plan\b/i,
  /\bbefore\s+(you\s+)?(start|begin|code|implement)/i,
  /\bplan\s+before\b/i,
  /\bwalk\s+me\s+through\b/i,
  /\blet('s|us)\s+(see|review)\s+(the\s+)?plan\b/i,
  /\bstep[- ]by[- ]step\s+plan\b/i,
  /\bplanning\s+phase\b/i,
  /\bplanning\s+mode\b/i,
];

/**
 * Checks if a user prompt contains a request for a planning phase.
 *
 * @param prompt - The user's input message
 * @returns True if the user is asking for a plan before execution
 *
 * @example
 * isPlanningRequest('Create a todo app, but plan it out first'); // true
 * isPlanningRequest('Build me a calculator'); // false
 */
export function isPlanningRequest(prompt: string): boolean {
  return PLANNING_PATTERNS.some((pattern) => pattern.test(prompt));
}

/**
 * The planning phase instructions to prepend to the system prompt
 * when a planning request is detected.
 */
export const PLANNING_INSTRUCTIONS = `
PLANNING PHASE ACTIVATED:
The user has requested a planning phase before execution. You MUST:

1. DO NOT execute any tools yet - only create a plan first
2. Analyze the user's request thoroughly
3. Create a detailed, numbered implementation plan that includes:
   - Project structure (files and directories to create)
   - Technologies and libraries to use
   - Step-by-step implementation order
   - Key features and their implementation approach
   - Potential challenges and how you'll address them
4. Present the plan to the user in a clear, readable format
5. Ask for the user's approval or feedback on the plan
6. WAIT for the user to respond with approval (e.g., "looks good", "proceed", "go ahead", "approved")
7. Only after explicit approval, begin executing the plan

Format your plan like this:

## 📋 Implementation Plan

### Project Structure
\`\`\`
project-name/
├── index.html
├── styles.css
└── script.js
\`\`\`

### Technologies
- List of technologies and why

### Implementation Steps
1. First step - description
2. Second step - description
...

### Potential Challenges
- Challenge 1 and mitigation
- Challenge 2 and mitigation

---
**Please review this plan and let me know if you'd like any changes, or say "proceed" to begin implementation.**
`;

/**
 * Patterns that indicate the user is approving a plan to proceed.
 */
const APPROVAL_PATTERNS: RegExp[] = [
  /\b(looks?\s+good|lgtm)\b/i,
  /\b(proceed|go\s+ahead|approved?|continue)\b/i,
  /\b(yes|yep|yeah|yup|sure|ok|okay)\b/i,
  /\bdo\s+it\b/i,
  /\bstart\s+(building|coding|implementing|working)\b/i,
  /\bbegin\b/i,
  /\bexecute\s+(the\s+)?plan\b/i,
  /\bship\s+it\b/i,
  /\blet('s|us)\s+(go|do\s+it|start)\b/i,
  /\bmake\s+it\s+(so|happen)\b/i,
];

/**
 * Checks if a user prompt is approving a previously presented plan.
 *
 * @param prompt - The user's input message
 * @returns True if the user is approving execution of a plan
 *
 * @example
 * isPlanApproval('Looks good, proceed!'); // true
 * isPlanApproval('Change step 3 to use a different approach'); // false
 */
export function isPlanApproval(prompt: string): boolean {
  // Short messages are more likely to be simple approvals
  const isShortMessage = prompt.trim().split(/\s+/).length <= 5;
  return (
    isShortMessage && APPROVAL_PATTERNS.some((pattern) => pattern.test(prompt))
  );
}
