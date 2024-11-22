# AI SDK Server

What if we build Next.js, but for AI agents?

These are the hard problems we want to solve:

- state machine with good DX (states <=> pages, state ids <=> routes)
- streaming is first class
- long running streaming (hours, days, weeks)
- resilient to disconnect / reconnect / stream breakages
- durability and error recovery at state boundaries
- each step is a complete state execution (states can loop)
- user defined input processing, state logic, stream format
- upgradability during agent runs when possible
