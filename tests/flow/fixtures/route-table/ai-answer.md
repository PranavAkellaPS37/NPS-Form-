Sure! Here is your route as one table, made from your flowchart:

```markdown
| Code | Type | English | Hindi | Options | Show if | Go to | Jump | Repeat | Visible | Left end | Right end |
|:-----|:----:|---------|-------|---------|---------|-------|------|--------|---------|----------|-----------|
| `language` | Language | | | | | | | | yes | | |
| `nps` | NPS | How likely are you to recommend Valmo to another DC owner? | | | | | `if nps <= 6 go to effort` | | yes | | |
| `fn_ratings` | Area ratings | | | | | | | | yes | | |
| `fn_deep_dives` | Problem screens | | | | | | | | yes | | |
| `support_gate` | Support question | In the last 30 days, did you contact Valmo support? | | | | | | | yes | | |
| `support` | Support ratings | | | | support_gate = yes | | | | yes | | |
| `one_fix` | Voice/typing | If Valmo could fix just one thing for you, what should it be? | | | | end | | | yes | | |
| `thanks` | Thank you | | | | | | | | yes | | |
| `effort` | 0-10 | How easy is it to work with Valmo \| day to day? | | | | | | | yes | Very hard | Very easy |
| `effort_why` | Voice/typing | What makes it hard?<br>Tell us in your own words. | | | effort <= 4 | | | | yes | | |
| `detractor_end` | Ending | **Thank you, we will look into it** | | | | | | | yes | | |
```

Let me know if you want any changes. The detractor route starts at `effort`.
