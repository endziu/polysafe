.PHONY: build test clear

build:
	mkdir -p dist
	cp polysafe.html dist/index.html
	cp polysafe.html dist/polysafe.html
	cp CNAME dist/CNAME

test:
	node --test tests/polysafe.test.mjs

clear:
	rm -f dist/index.html dist/polysafe.html dist/CNAME
	rmdir dist 2>/dev/null || true
