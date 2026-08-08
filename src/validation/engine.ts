import type { AlgorithmValidator, PolicyInfo, TrafficMetrics, ValidationResult } from './types.js';
import { TokenBucketValidator } from './validators/token-bucket.validator.js';
import { FixedWindowValidator } from './validators/fixed-window.validator.js';
import { SlidingWindowValidator } from './validators/sliding-window.validator.js';

export class ValidationEngine {
  private validators: Map<string, AlgorithmValidator> = new Map();

  constructor() {
    this.validators.set('token_bucket', new TokenBucketValidator());
    this.validators.set('fixed_window', new FixedWindowValidator());
    this.validators.set('sliding_window', new SlidingWindowValidator());
  }

  /**
   * Delegates validation polymorphically to the registered AlgorithmValidator for the policy.
   */
  public validate(
    policy: PolicyInfo,
    traffic: TrafficMetrics,
    actualDurationSecs: number,
    algorithmState: Record<string, any>
  ): ValidationResult {
    const validator = this.validators.get(policy.algorithm);
    if (!validator) {
      throw new Error(`No validator registered for algorithm: ${policy.algorithm}`);
    }

    return validator.validate(policy, traffic, actualDurationSecs, algorithmState);
  }
}
