import { expectTypeOf, it } from 'vitest';
import type { GatewayGenerationInfo } from './gateway-generation-info';

it('accepts generation info without the optional cost breakdown', () => {
  expectTypeOf<
    Omit<GatewayGenerationInfo, 'marketCost' | 'surchargeCost' | 'gatewayCost'>
  >().toMatchTypeOf<GatewayGenerationInfo>();
});
