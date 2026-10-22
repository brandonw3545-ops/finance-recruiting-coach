---
topic: Present value, discount rates, NPV and IRR: the engine behind every valuation
---
# Present value, discount rates, NPV and IRR: the engine behind every valuation
*Comes up in:* Corporate finance and private equity interviews especially, and as a building block for every DCF question.

## Cold open
"What's the difference between NPV and IRR?"

Answer it out loud before you read on.

## The big idea
**Net present value (NPV)** adds up the present value of a project's future cash flows, at the return you require, and subtracts what it costs today. Positive NPV means the project earns more than your required return, and the number tells you how much value it creates in today's dollars. **Internal rate of return (IRR)** is the discount rate that makes NPV exactly zero: the project's own implied annual return. Think of NPV as the profit in today's dollars and IRR as the interest rate the project pays you.

## How it works
Say a project costs $1,000 today and pays $400 at the end of each of the next three years.

| Year | Cash flow | Present value at 8% | Present value at 10% |
|---|---|---|---|
| 1 | 400 | 370.37 | 363.64 |
| 2 | 400 | 342.94 | 330.58 |
| 3 | 400 | 317.53 | 300.53 |
| **Total** | | **1,030.84** | **994.74** |
| **NPV (minus 1,000)** | | **+30.84** | **−5.26** |

At an 8% required return the project creates value; at 10% it doesn't. The IRR sits in between, at about 9.7%: the rate where the present value of the cash flows equals exactly $1,000. The decision rules: accept if NPV is positive, or equivalently if IRR beats your required return.

They usually agree, but not always. IRR ignores size: a $10 project with a 50% IRR creates less value than a $10 million project with a 15% IRR. IRR assumes cash flows are reinvested at the IRR itself. And when cash flows switch between positive and negative more than once, a project can have more than one IRR. When the two conflict, NPV is the better guide to value.

## In the real world
Private equity funds report IRR alongside MOIC (multiple on invested capital), and the gap between the two is worth watching. Many funds borrow on short-term credit lines before calling money from their investors, which shortens the time investors' cash is at work and raises IRR without raising the actual profit. The Institutional Limited Partners Association, the main investor trade group, published guidance in 2017 asking funds to disclose that effect. When you read a fund's results, check the multiple as well as the IRR: a high IRR on a small multiple can mean a quick trade rather than a great investment.

## The interview trap
The trap is saying IRR is "better" than NPV, or not knowing that IRR is the rate at which NPV equals zero.

> NPV is the present value of a project's future cash flows minus what it costs today, using the return you require as the discount rate. If NPV is positive, the project earns more than your required return and creates value, measured in dollars. IRR is the discount rate that makes NPV exactly zero, so it's the project's implied annual return, and you accept a project if its IRR beats your required return. They usually agree, but when they conflict, NPV is the better guide, because IRR ignores the size of a project and can mislead when cash flows change sign more than once. A small project with a 50% IRR can create less value than a large one with a 15% IRR.

## Your line
"NPV tells you how much value a project creates; IRR tells you how fast." **Follow-up you'll get:** "Why do private equity firms care so much about IRR?" **The other side:** IRR assumes cash flows can be reinvested at the same high rate, which is often unrealistic; the modified IRR fixes that by assuming a more modest reinvestment rate.

## Your turn
1. **Say it out loud:** A project costs $1,000 and pays $400 a year for three years. Would you do it with a 10% required return? Explain how you'd decide.
2. **Rapid fire:**
   a. What's the IRR of an investment that turns $100 into $121 in two years?
   b. If NPV is positive at a 10% discount rate, is the IRR above or below 10%?
   c. Name one weakness of IRR.
3. **Rewind:** What three things make money today worth more than money later?
4. **Brain teaser:** Roughly what is 1 ÷ 1.1, and why is it a useful number to know?

## Answers
- **Say it out loud:** Discount each $400 at 10%: about $364, $331 and $301, for a total of about $995. NPV is about −$5, so at a 10% required return it narrowly destroys value, and the IRR, about 9.7%, falls just short. A strong answer also notes that the decision is close, so the assumptions matter.
- **a.** 10%.
- **b.** Above 10%.
- **c.** Any of: it ignores the size of the project, it assumes reinvestment at the IRR, it can produce more than one answer when cash flows change sign, and it's sensitive to timing.
- **Rewind:** You could invest it and earn a return, inflation erodes future dollars, and a future payment carries risk.
- **Brain teaser:** About 0.909. It's the present value of $1 received in one year at a 10% discount rate.
