path = '/Users/nicholasalexander/Code/AI/World Domination/backend/internal/game/economy_test.go'
with open(path) as f:
    c = f.read()

# ComputeEconomy calls: strip the stray ', 0, 0' and insert the two args before ')'
for prefix in [
    'ComputeEconomy(1000, 500, 100, 50, 0, 0), 0, 0',
    'ComputeEconomy(1000, 500, 100, 10, 0, 0), 0, 0',
    'ComputeEconomy(1000, 500, 100, 60, 0, 0), 0, 0',
    'ComputeEconomy(1000, 500, 100, 95, 0, 0), 0, 0',
    'ComputeEconomy(1000, 500, 500, 50, 0, 0), 0, 0',
    'ComputeEconomy(1000, 5000, 100, 50, 0, 0), 0, 0',
    'ComputeEconomy(1000, 500, 100, 50, 3, 2), 0, 0',
    'ComputeEconomy(1000, 500, 0, 50, 0, 0), 0, 0',
    'ComputeEconomy(1000, 500, 100000, 10, 0, 0), 0, 0',
]:
    assert prefix in c, prefix
    c = c.replace(prefix, prefix.replace(', 0, 0', ''))

# PopulationGrowth calls: same treatment
for prefix in [
    'PopulationGrowth(0, 50, 0, 0), 0, 0',
    'PopulationGrowth(1000, 10, 0, 0), 0, 0',
    'PopulationGrowth(1000, 90, 0, 0), 0, 0',
    'PopulationGrowth(1000, 50, 4, 4), 0, 0',
    'PopulationGrowth(1000, 50, 0, 0), 0, 0',
]:
    assert prefix in c, prefix
    c = c.replace(prefix, prefix.replace(', 0, 0', ''))

with open(path, 'w') as f:
    f.write(c)
print('done')