#!/bin/bash
# Сверка 39 «изменённых» файлов из КТ1: реальные правки vs шум перевода строк (CRLF/LF)
ZIP=/home/z/my-project/download/logix-v0.6.2.zip
FILES=(
"CHANGELOG.md"
"package.json"
"docs/DEPRECATIONS.md"
"docs/INVENTORY.md"
"docs/ROADMAP.md"
"docs/ROADMAP-DEALFLOW.md"
"prisma/schema.prisma"
"scripts/e2e_api_test.py"
"scripts/integrity-baseline.json"
"scripts/integrity_check.py"
"scripts/knip-baseline.json"
"src/app/admin/(dashboard)/page.tsx"
"src/app/api/admin/brokers/[id]/route.ts"
"src/app/api/admin/brokers/route.ts"
"src/app/api/admin/customers/[id]/access/route.ts"
"src/app/api/admin/customers/[id]/route.ts"
"src/app/api/admin/leads/[id]/convert/helpers.ts"
"src/app/api/admin/leads/[id]/documents/route.ts"
"src/app/api/admin/leads/[id]/route.ts"
"src/app/api/admin/orders/[id]/documents/route.ts"
"src/app/api/admin/orders/[id]/route.ts"
"src/app/api/auth/broker/login/route.ts"
"src/app/api/auth/client/login/route.ts"
"src/app/api/broker/documents/[id]/versions/route.ts"
"src/app/api/broker/leads/[id]/documents/route.ts"
"src/app/api/broker/leads/[id]/estimate/route.ts"
"src/app/api/broker/orders/[id]/documents/route.ts"
"src/app/api/client/documents/[id]/versions/route.ts"
"src/app/api/client/leads/[id]/documents/route.ts"
"src/app/api/client/orders/[id]/documents/route.ts"
"src/components/admin/BrokersList.tsx"
"src/components/admin/CustomerCabinetAccess.tsx"
"src/components/admin/CustomerCard.tsx"
"src/components/admin/broker/BrokerCard.tsx"
"src/lib/activity.ts"
"src/lib/broker-auth.ts"
"src/lib/client-auth.ts"
"src/lib/client-constants.ts"
"src/lib/documents.ts"
)
same=0; diff=0
for f in "${FILES[@]}"; do
  esc=${f//[/\\[}; esc=${esc//]/\\]}
  a=$(git -C /home/z/my-project cat-file blob "8e69005:$f" 2>/dev/null | sha256sum | cut -d' ' -f1)
  b=$(unzip -p "$ZIP" "$esc" | tr -d '\r' | sha256sum | cut -d' ' -f1)
  if [ "$a" = "$b" ]; then echo "SAME(normalized)  $f"; same=$((same+1)); else echo "DIFF              $f"; diff=$((diff+1)); fi
done
echo "---"
echo "same(только переводы строк): $same, реальных правок: $diff"
