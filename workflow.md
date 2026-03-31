# Development workflow

Claude Code must follow this structured workflow for all feature implementations and significant changes. This workflow enforces test-driven development with rigorous quality gates.

## Workflow overview

```
Onboard → Plan → Write Tests → Implement → CTO Review → Fix Issues → Re-review
                                               ↑                          |
                                               |__________________________|
                                            MANDATORY LOOP - NO EXCEPTIONS
                                         (Continue until zero CRITICAL/MAJOR
                                          issues OR 3 cycles completed)
```

## Phase 1: Onboard yourself to the task

**Objective:** Thoroughly onboard yourself to the current task, exploring the codebase comprehensively and asking clarifying questions.

**Philosophy:** "AI models are geniuses who start from scratch on every task." – Noam Brown

**Context:** You will be given task requirements in `$ARGUMENTS`

**Actions:**
1. **Enable extended thinking mode** - Use ultrathink to reason deeply about the task
2. **Explore the codebase thoroughly:**
   - Read relevant files, components, and services
   - Understand the current architecture and patterns
   - Identify dependencies and integration points
   - Review existing tests and test patterns
   - Understand how this task fits into the broader system
   - Map out data flow and state management
   - Review the tech stack (Next.js, React, Express, MongoDB, TypeScript, Socket.io, AWS SQS, Redis)
3. **Use subagents liberally** to investigate specific questions or verify understanding
4. **Ask clarifying questions** if requirements are ambiguous or incomplete
5. **Document everything** in `.claude/tasks/[TASK_ID]/onboarding.md`

**Rules:**
- Do NOT write any code in this phase
- Take as long as you need - thoroughness is critical
- Overdoing it is better than underdoing it
- The onboarding.md file must be comprehensive enough to onboard a fresh session
- Think deeply about edge cases, integration points, and potential complications

**Output:** A comprehensive `.claude/tasks/[TASK_ID]/onboarding.md` file containing:
- Task summary and requirements
- Relevant codebase exploration findings
- Architecture and pattern analysis
- Dependencies and integration points
- Questions asked and answers received
- Potential risks and complications identified
- Key insights and considerations

## Phase 2: Create implementation plan

**Objective:** Document a detailed, actionable technical plan based on your onboarding.

**Actions:**
- Reference your onboarding.md to ensure nothing is missed
- Break down the work into logical, sequential steps
- Identify which files need to be created or modified
- Define the test strategy (unit tests, integration tests, e2e tests)
- Specify expected inputs and outputs for each component
- Map out error cases and edge cases
- Document architectural decisions and rationale
- Identify potential risks and mitigation strategies
- Consider performance implications
- Plan for backwards compatibility if needed

**Rules:**
- Document the plan comprehensively, then proceed automatically to Phase 3
- Be specific about file paths, function signatures, and interfaces
- Include clear acceptance criteria
- Reference existing patterns from your onboarding research
- Explain WHY decisions are made, not just WHAT to do

**Output:** A written plan in `.claude/tasks/[TASK_ID]/plan.md` that includes:
1. **Overview:** High-level description of what's being built
2. **Files to create/modify:** Exact paths and purposes
3. **Step-by-step implementation approach:** Detailed, sequential steps
4. **Test strategy:** What tests to write and why
5. **Expected behaviour:** Inputs, outputs, and side effects
6. **Edge cases:** Error handling and boundary conditions
7. **Architectural decisions:** With rationale
8. **Acceptance criteria:** Clear definition of done
9. **Risks and mitigations:** What could go wrong and how to handle it

## Phase 3: Write tests (TDD)

**Objective:** Write comprehensive tests before implementing functionality.

**Actions:**
- Write tests based on expected input/output pairs from the plan
- Cover happy path and error cases
- Include edge cases and boundary conditions
- Follow existing test patterns in the codebase

**Rules:**
- Do NOT create mock implementations
- Do NOT implement any functionality yet
- Tests should fail when run (red phase of TDD)
- Explicitly run tests and confirm they fail

**Output:**
- Test files committed to the repository
- Confirmation that tests fail as expected

## Phase 4: Implementation

**Objective:** Implement the functionality to make tests pass.

**Actions:**
- Write the minimum code necessary to make tests pass
- Follow the implementation plan from Phase 2
- Adhere to the project's code style guidelines
- Use strong TypeScript typing
- Follow existing architectural patterns

**Rules:**
- Stay focused on the approved plan
- If you discover the plan needs changes, STOP and revise the plan
- Run tests frequently to verify progress
- Commit changes incrementally

**Output:**
- Working implementation with passing tests
- Code follows project style guidelines
- All tests passing

## Phase 5: CTO review (MANDATORY)

**Objective:** Rigorous code review to identify issues before considering the work complete.

**⚠️ CRITICAL: THIS PHASE CANNOT BE SKIPPED. You MUST use the Task tool to invoke a subagent for an independent review.**

**Actions:**
1. **MUST use Task tool** with `subagent_type: "general-purpose"` to perform review
2. The subagent reviews ALL changed files for:
   - **Architecture:** Does this follow Second Nature patterns? Is it maintainable?
   - **Security:** Any vulnerabilities or data exposure risks? (PHI, PII handling)
   - **Performance:** Database queries efficient? N+1 queries? Large data loading?
   - **Type safety:** Strict TypeScript? No `any` types? Proper interfaces?
   - **Error handling:** All errors caught? User-facing error messages clear?
   - **Testing:** Coverage adequate? Edge cases? Integration tests for new routes?
   - **Code style:** Follows CLAUDE.md guidelines? (arrow functions, const, no default exports, single quotes)
   - **Business logic:** Correct handling of User/Group/Programme relationships? NHS referral flows?
   - **Database:** Proper indexes? Schema changes backward compatible?
   - **Codebase patterns:** Matches existing patterns in apps/api, apps/basecamp, apps/worker?

**Rules:**
- **YOU MUST INVOKE A SUBAGENT** - Do NOT skip this step
- The subagent must assume it did NOT write this code
- List ALL issues as numbered items with severity: **CRITICAL** (blocking), **MAJOR** (should fix), **MINOR** (nice to have)
- Provide specific file paths with line numbers (e.g., `apps/api/src/services/foo.ts:42`)
- Explain WHY each issue matters for production readiness
- Save review output to `.claude/tasks/[TASK_ID]/reviews/review-[N].md`

**Output:**
- A markdown file with numbered issues and severities
- OR "No issues found - approved for production" if truly zero issues

## Phase 6: Fix review feedback (MANDATORY)

**Objective:** Address ALL CRITICAL and MAJOR issues identified in the review.

**⚠️ CRITICAL: You MUST fix all CRITICAL issues. You MUST fix or document all MAJOR issues.**

**Actions:**
1. **Fix CRITICAL issues first** - These are blocking and must be resolved
2. **Fix MAJOR issues** - Should be fixed unless there's a documented reason to defer
3. **Consider MINOR issues** - Fix if trivial, otherwise document for future work
4. Re-run all tests after each fix to ensure no regressions
5. Document all fixes in `.claude/tasks/[TASK_ID]/reviews/fixes-[N].md`

**Rules:**
- **CRITICAL issues CANNOT be deferred** - They must be fixed before proceeding
- MAJOR issues should be fixed OR you must document a specific reason to defer
- If you disagree with feedback, document your reasoning but err on the side of fixing
- Do NOT introduce new issues while fixing (this will be caught in re-review)
- Run tests after each fix to verify no regressions
- **AUTOMATICALLY proceed to Phase 7** - DO NOT SKIP RE-REVIEW

**Output:**
- ALL CRITICAL issues resolved (zero remaining)
- ALL MAJOR issues resolved or explicitly deferred with justification
- Tests still passing (or clearly documented if failing)
- Fixes documented in `fixes-[N].md`
- Code ready for re-review

## Phase 7: Re-review loop (MANDATORY - CANNOT SKIP)

**Objective:** Verify ALL issues are resolved and NO new issues were introduced.

**⚠️ ABSOLUTELY CRITICAL: THIS PHASE IS NOT OPTIONAL. YOU MUST RE-REVIEW AFTER EVERY FIX CYCLE.**

**Actions:**
1. **IMMEDIATELY invoke Task tool** with `subagent_type: "general-purpose"` for fresh review
2. The subagent performs FULL review (same rigor as Phase 5) of ALL changed files
3. Save review output to `.claude/tasks/[TASK_ID]/reviews/review-[N].md`
4. **Decision tree:**
   - **CRITICAL or MAJOR issues found** → RETURN TO PHASE 6 (document in review-[N].md)
   - **Only MINOR issues found** → Proceed to Phase 8
   - **Zero issues found** → Proceed to Phase 8
5. **Maximum 3 review cycles** (prevents infinite loops)

**Rules:**
- **THIS IS NOT NEGOTIABLE** - You CANNOT skip this re-review
- **MUST use Task tool with subagent** - Fresh eyes required
- Each review must be as thorough as the original (no shortcuts)
- Count review cycles: review-1, review-2, review-3
- After 3 cycles, proceed to Phase 8 but document any remaining issues clearly
- The subagent must verify that previous issues are ACTUALLY FIXED, not just claimed to be fixed

**Loop exit conditions:**
1. ✅ Zero CRITICAL/MAJOR issues found → Proceed to Phase 8
2. ✅ Maximum 3 cycles reached → Proceed to Phase 8 (document remaining issues)
3. ❌ CRITICAL/MAJOR issues remain after < 3 cycles → MUST continue loop (return to Phase 6)

**Output:**
- Review file `review-[N].md` with either:
  - "No CRITICAL/MAJOR issues found - approved for Phase 8"
  - OR numbered list of remaining issues with severities
- Clear documentation if 3-cycle limit reached with outstanding issues

## Phase 8: Final verification and commit

**Objective:** Verify quality gates and commit changes to git.

**Actions:**
1. **Quality Gates** (run these checks based on what you changed):
   - If API changed: `npm run typescript:api` and `npm run lint:api`
   - If Basecamp changed: `npm run typescript:basecamp` and `npm run lint:basecamp`
   - If Website changed: `npm run typescript:website` and `npm run lint:website`
   - If Worker changed: `npm run typescript:worker` and `npm run lint:worker`
   - Run relevant tests: `npm run test:api:unit`, `npm run test:worker:unit`, etc.
   - Document results in `.claude/tasks/[TASK_ID]/quality-gates.md`

2. **Create Commit** (automatically):
   - Stage relevant files: `git add <modified-files>`
   - **DO NOT stage package-lock.json** unless you explicitly changed dependencies
   - Create descriptive commit message following repo conventions
   - Include task summary and key changes
   - Add workflow footer:
     ```
     🤖 Generated with [Claude Code](https://claude.com/claude-code)

     Co-Authored-By: Claude <noreply@anthropic.com>
     ```

3. **Push Changes** (automatically):
   - Push to current branch: `git push`
   - Document commit hash in `.claude/tasks/[TASK_ID]/completion.md`

**Rules:**
- Run quality gates even if tests have issues (document results)
- ALWAYS commit changes (don't ask for permission)
- Use descriptive commit message with context
- Push immediately after committing
- If push fails (e.g., no remote), document but continue
- Revert accidental package-lock.json changes before committing

**Output:**
- Quality gates results documented
- Changes committed to git
- Changes pushed to remote
- Task marked complete

## When to use this workflow

**✅ Use this workflow for:**
- New features or significant functionality
- Refactoring critical code paths
- Architectural changes
- Changes affecting multiple systems or integrations
- Security-sensitive modifications (authentication, data handling, API integrations)
- Performance-critical implementations
- Database schema changes
- Changes to NHS referral flows or User/Group/Programme relationships
- External API integrations
- Real-time chat/websocket functionality

**❌ Skip this workflow for:**
- Simple bug fixes (obvious one-line changes)
- Minor text or style updates
- Trivial documentation changes
- Exploratory prototyping (use a separate branch)

## Workflow execution commands

To start a new task following this workflow:

```bash
# Create task directory structure
mkdir -p .claude/tasks/[TASK_ID]

# Begin Phase 1: Onboarding
# Use extended thinking and provide task context
```

## Task directory structure

```
.claude/tasks/[TASK_ID]/
├── onboarding.md      # Phase 1: Comprehensive onboarding notes
├── plan.md            # Phase 2: Detailed implementation plan
├── tests.md           # Phase 3: Test strategy and test list
├── implementation.md  # Phase 4: Implementation notes and decisions
└── reviews/           # Phase 5-7: All CTO reviews and fixes
    ├── review-1.md
    ├── fixes-1.md
    ├── review-2.md
    ├── fixes-2.md
    └── final-approval.md
```

## Tips for success

1. **Don't rush onboarding** - The time spent in Phase 1 will save multiples of that time in later phases
2. **Use extended thinking liberally** - Complex tasks deserve deep reasoning
3. **Document everything** - Future sessions and team members will thank you
4. **Be critical in reviews** - Act as if you didn't write the code yourself
5. **Fix all issues** - Don't skip "minor" issues; they compound over time
6. **Ask questions early** - Better to clarify in Phase 1 than pivot in Phase 4
7. **Reference existing patterns** - The onboarding phase should identify patterns to follow
8. **Keep tests focused** - Each test should verify one specific behaviour
9. **Commit incrementally** - Don't wait until everything is done to commit
10. **Update documentation** - If the change affects documentation.md or other docs, update them
