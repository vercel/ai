import { createGoogle } from '@ai-sdk/google';
import { generateText } from 'ai';
import { Agent } from 'undici';
import { run } from '../../lib/run';

run(async () => {
  // Allow each HTTP request to wait up to 20 minutes for headers or data.
  const dispatcher = new Agent({
    headersTimeout: 20 * 60 * 1000,
    bodyTimeout: 20 * 60 * 1000,
  });
  const google = createGoogle({
    fetch: (url, options) => {
      const requestOptions = { ...options, dispatcher };
      return fetch(url, requestOptions);
    },
  });

  try {
    const result = await generateText({
      model: google.interactions('gemini-4-argon'),
      prompt: `Write a comprehensive mathematical monograph and a complete, production-quality Python quantitative library for pricing, hedging, and calibrating exotic path-dependent derivatives under the Rough Heston ($H in (0, 1/2)$) and multi-factor Rough Bergomi fractional stochastic volatility models, coupled with Hamilton-Jacobi-Bellman (HJB) optimal market-making under Hawkes jump-diffusion order flow.

Provide every mathematical proof and every line of code in full:
1. **Fractional Riccati-Volterra Characteristic Function Derivation**: Prove the El Euch & Rosenbaum theorem reducing the conditional characteristic function of log-spot in the Rough Heston model to a fractional Riccati-Volterra integral equation with kernel $K(t) = \frac{t^{alpha-1}}{Gamma(alpha)}$, derive its short-time ($T \to 0$) and large-strike Roger Lee / Forde-Jacquier asymptotic implied volatility skew explosion $t^{H - 1/2}$ via Gartner-Ellis large deviations.
2. **Malliavin Calculus & Pathwise Adjoint Greeks**: Derive the Malliavin integration-by-parts weights for Delta, Gamma, Vega, and Vanna of barrier and Asian options under Volterra Gaussian processes, avoiding finite-difference variance blowup.
3. **HJB Variational Inequality for Optimal Market Making**: Formulate and solve the coupled integro-differential HJB equations for an inventory-constrained market maker facing mutually exciting bivariate Hawkes order arrivals and rough volatility, proving existence, uniqueness, and verification via viscosity solutions.
4. **Complete Runnable Python Quantitative Library**: Full implementation of the Adams-Diethelm predictor-corrector and Markovian multi-exponential sum-of-exponentials approximation for fractional Riccati equations, Carr-Madan / Lewis Lewis-COS Fourier option pricer, Hybrid BSD scheme for Rough Bergomi Monte Carlo with control variates, Longstaff-Schwartz American option pricer, and Levenberg-Marquardt SVI / Rough Heston implied volatility surface calibration engine with synthetic SPX/VIX joint calibration tests.`,
      maxOutputTokens: 131_072,
      timeout: 60 * 60 * 1000, // total time across all requests
      providerOptions: { google: { background: false } },
    });

    console.log(result.text);
    console.log('Combined usage:', result.usage);
    console.log(
      'Final interaction ID:',
      result.providerMetadata?.google?.interactionId,
    );
    console.log('Finish reason:', result.finishReason);
  } finally {
    await dispatcher.close();
  }
});
