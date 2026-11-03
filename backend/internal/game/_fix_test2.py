import re

path = '/Users/nicholasalexander/Code/AI/World Domination/backend/internal/game/economy_test.go'
with open(path) as f:
    lines = f.readlines()

out = []
for line in lines:
    # ComputeEconomy now takes 8 args: population, taxRate, markets, infrastructure, investment, socialCosts
    if 'ComputeEconomy(' in line:
        if line.rstrip().endswith(')'):
            line = line.rstrip()[:-1] + ', 0, 0, 0, 0)'
        elif line.rstrip().endswith(', 0, 0)'):
            line = line.rstrip()[:-len(', 0, 0)') + 1] + ', 0, 0, 0, 0)'
    # PopulationGrowth now takes 6 args: population, taxRate, markets, infrastructure, investment, socialCosts
    elif 'PopulationGrowth(' in line:
        if line.rstrip().endswith(')'):
            line = line.rstrip()[:-1] + ', 0, 0)'
        elif line.rstrip().endswith(', 0, 0)'):
            line = line.rstrip()[:-len(', 0, 0)') + 1] + ', 0, 0)'
    out.append(line)

with open(path, 'w') as f:
    f.writelines(out)
print('done')