---
topic: DCF, part 3: terminal value, and why it's most of the answer
---
# DCF, part 3: terminal value, and why it's most of the answer
*Comes up in:* Banking and private equity technicals, often as the follow-up to "walk me through a DCF."

## Cold open
"What is terminal value, and what are the two ways to calculate it?"

Answer it out loud before you read on.

## The big idea
A company doesn't stop operating when your five-year projection ends, so the terminal value captures everything after that, in one number. It's usually the largest part of a DCF. Think of buying a house to rent out for five years and then sell: the rent matters, but the sale price at the end usually matters more.

## How it works
Two methods:

- **Perpetuity growth:** terminal value = final-year free cash flow × (1 + g) ÷ (WACC − g), where g is a long-term growth rate, usually 2% to 3%, below the long-run growth of the economy.
- **Exit multiple:** terminal value = final-year EBITDA × an EV/EBITDA multiple taken from comparable companies.

Either way, you then discount the terminal value back to today, just like the yearly cash flows.

Using the five-year projection from part one (final-year free cash flow of 210.8), with a 9% WACC and 2.5% growth:

| Step | Amount |
|---|---|
| Terminal value = 210.8 × 1.025 ÷ (0.09 − 0.025) | 3,324.6 |
| Discounted five years: 3,324.6 ÷ 1.09⁵ | 2,160.8 |
| Present value of years 1 to 5 | 672.8 |
| **Enterprise value** | **2,833.6** |
| Terminal value's share of the total | **76%** |

Cross-check: that terminal value is about 8.3 times year-five EBITDA of 402.6, a believable multiple. Now see how sensitive it is:

| Enterprise value | g = 2.0% | g = 2.5% | g = 3.0% |
|---|---|---|---|
| WACC 8% | 3,131 | 3,366 | 3,648 |
| WACC 9% | 2,669 | 2,834 | 3,025 |
| WACC 10% | 2,324 | 2,444 | 2,581 |

A one-point change in WACC moves the value by roughly 15%, and growth must always stay below WACC, or the formula breaks.

## In the real world
Companies whose value sits mostly in the distant future live and die by the terminal value, and 2022 showed it. As interest rates rose and discount rates went up with them, the ARK Innovation ETF, a fund of high-growth companies with little current profit, fell about 67% that year, far more than the overall market. Most of those companies' value had been terminal value, and terminal value is the part most sensitive to the discount rate. When you look at any DCF, check what share of the value comes from the terminal value and what exit multiple it implies.

## The interview trap
The traps are using a growth rate of 5% or more forever, picking a growth rate above WACC, and forgetting to discount the terminal value back to today.

> Terminal value captures the value of all the cash flows after the projection period, since a company doesn't stop operating after five or ten years. There are two ways to calculate it. The perpetuity growth method takes the final year's free cash flow, grows it by a long-term growth rate, and divides by the discount rate minus that growth rate; the growth rate should be modest, usually below long-run economic growth. The exit multiple method applies a multiple, like EV to EBITDA from comparable companies, to the final year's EBITDA. Either way, you then discount the terminal value back to today. It often makes up well over half of a DCF's value, which is why analysts cross-check the two methods and run sensitivity tables on the growth rate, the multiple and the discount rate.

## Your line
"In most DCFs, the terminal value is the valuation; the projection years are the setup." **Follow-up you'll get:** "Which method do you prefer, and how do you sanity-check it?" **The other side:** The exit multiple method imports today's market mood into a value years from now, which some see as circular.

## Your turn
1. **Say it out loud:** Why does terminal value usually make up most of a DCF's value, and why is that a problem?
2. **Rapid fire:**
   a. Final-year free cash flow is 100, WACC is 10% and long-term growth is 2%. What's the perpetuity growth terminal value?
   b. Final-year EBITDA is 50 and the exit multiple is 9x. What's the terminal value?
   c. Why must the growth rate be lower than WACC?
3. **Rewind:** What's the CAPM formula for the cost of equity?
4. **Brain teaser:** What is 1 ÷ 0.08, and why is that number useful?

## Answers
- **Say it out loud:** It represents every year after the projection period, often decades of cash flows, so it's naturally large. The problem is that it rests on the least certain assumptions, long-term growth and the discount rate, and small changes in either swing the whole valuation. A strong answer mentions sensitivity tables and the exit multiple cross-check.
- **a.** 1,275: 100 × 1.02 ÷ 0.08.
- **b.** 450.
- **c.** Otherwise the formula gives an infinite or negative value; no company can grow faster than the economy forever.
- **Rewind:** Cost of equity = risk-free rate + beta × equity risk premium.
- **Brain teaser:** 12.5. It's the value of a perpetuity paying $1 a year at 8%, so a steady cash flow at an 8% discount rate is worth 12.5 times one year's payment.
