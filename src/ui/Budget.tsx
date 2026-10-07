interface BudgetProps {
  cost: number;
  budget: number;
}

/** What the bridge costs against the level's budget; red when over (a star less). */
export function Budget({ cost, budget }: BudgetProps) {
  const over = cost > budget;
  return (
    <div
      className={over ? 'budget budget-over' : 'budget'}
      aria-label={`Cost ${cost} of budget ${budget}${over ? ', over budget' : ''}`}
    >
      $ {cost} / {budget}
    </div>
  );
}
