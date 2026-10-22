---
topic: Options 101: calls and puts in plain English
---
# Options 101: calls and puts in plain English
*Comes up in:* Sales and trading interviews, especially on derivatives desks, and as a stretch question in asset management.

## Cold open
"What's the difference between a call option and a put option?"

Answer it out loud before you read on.

## The big idea
An option is a contract that gives its buyer the right, but not the obligation, to buy or sell something at a set price, the **strike price**, on or before a set date, the **expiration**. A **call** is the right to buy; a **put** is the right to sell. The buyer pays the seller for that right; the price is called the **premium**. Think of a call as a deposit that holds a concert ticket at today's price: if prices jump, you're glad you locked it in, and if they fall, you just lose the deposit. A put is like insurance: you pay a premium so you can sell at a guaranteed price if things go badly.

## How it works
Say a stock trades at $100. You buy a three-month call with a $105 strike for $3, and a three-month put with a $95 strike for $2. Here's what each is worth at expiration:

| Stock price at expiration | Call payoff | Call profit | Put payoff | Put profit |
|---|---|---|---|---|
| $80 | $0 | −$3 | $15 | +$13 |
| $95 | $0 | −$3 | $0 | −$2 |
| $105 | $0 | −$3 | $0 | −$2 |
| $108 | $3 | $0 | $0 | −$2 |
| $120 | $15 | +$12 | $0 | −$2 |

The call breaks even at $108, the strike plus the premium; the put breaks even at $93, the strike minus the premium.

A few essentials:
- **The buyer's maximum loss is the premium.** The seller, or writer, collects the premium but takes on the obligation, and someone who sells calls on stock they don't own faces, in theory, unlimited losses.
- **Leverage:** if the stock rises 20% to $120, the call returns 400%, $12 on $3. If the stock goes nowhere, the call loses 100%.
- **Moneyness:** a call is in the money when the stock is above the strike, at the money when they're about equal, and out of the money when it's below. Puts are the reverse.
- **What drives an option's price:** the stock price relative to the strike, the time left until expiration, volatility, interest rates and dividends. More volatility makes options more valuable, because big moves help the buyer while the loss is capped. The Black–Scholes formula, published in 1973, put this into math.
- **Contract size:** a U.S. stock option contract covers 100 shares, so a $3 premium costs $300 per contract.
- **Uses:** hedging, like buying a put on a stock you own; income, like selling calls against stock you own (a covered call); and speculation.

## In the real world
In January 2021, retail traders, many of them organized on Reddit, piled into short-dated call options on GameStop. The dealers who sold those calls protected themselves by buying shares, which pushed the price up, which forced them to buy more: a "gamma squeeze," on top of a short squeeze against hedge funds that had bet the stock would fall. GameStop went from under $20 at the start of the month to an intraday high of $483 on January 28, before a later stock split. Some call buyers made fortunes; many who bought near the top lost their entire premium within days. Open the options chain for a stock you follow, free on most brokerage apps, pick one call and one put, and work out each one's breakeven.

## The interview trap
The traps are describing an option as an obligation to buy, forgetting the premium when working out profit, and mixing up which side carries the obligation.

> Both are contracts that give the buyer a right, not an obligation. A call gives the right to buy a stock at a set strike price before expiration, so it gains value when the stock rises; a put gives the right to sell at the strike, so it gains value when the stock falls. The buyer pays a premium, which is the most they can lose, while the seller collects the premium and takes on the obligation if the option is exercised. For example, a call with a $105 strike bought for $3 makes money only if the stock finishes above $108. Investors use calls to bet on a rise with limited downside, and puts to protect a position they own, much like buying insurance.

## Your line
"A call is a bet on the upside with a capped loss; a put is insurance against the downside." **Follow-up you'll get:** "What happens to an option's value when volatility rises, and why?" **The other side:** Options let you control a lot of stock for little money, which magnifies losses as much as gains; that's why many professionals use them more to hedge or earn income than to speculate.

## Your turn
1. **Say it out loud:** Explain a put option to a friend using an insurance analogy.
2. **Rapid fire:**
   a. You buy a call with a $50 strike for $4, and the stock is at $60 at expiration. What's your profit per share?
   b. What's the breakeven on that call?
   c. You buy a put with a $30 strike for $2, and the stock finishes at $35. What's your profit or loss?
3. **Rewind:** What are the five parts of a stock pitch?
4. **Brain teaser:** An option's premium is $2.50. What does one contract cost?

## Answers
- **Say it out loud:** Owning a stock is like owning a car; buying a put is like buying insurance on it. You pay a premium, and if the stock crashes, you can still sell it at the strike price, the way insurance pays out after a crash. If nothing bad happens, you've lost only the premium. A strong answer names the strike, the premium and the expiration in plain words.
- **a.** $6: a $10 payoff minus the $4 premium.
- **b.** $54.
- **c.** A loss of $2 per share: the put expires worthless, so you lose the premium.
- **Rewind:** Recommendation, thesis, catalysts, valuation and risks.
- **Brain teaser:** $250, since a contract covers 100 shares.
