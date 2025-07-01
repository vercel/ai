## background

Google's object-tool mode was ignoring system instructions while regular and object-json modes worked correctly, causing inconsistent behavior across generation modes.

## summary

- fix missing systemInstruction in object-tool mode

## verification

- all tests pass including new object-tool systemInstruction test
- systemInstruction now included consistently across all three modes

## tasks

- [x] add systemInstruction to object-tool case in getArgs method
- [x] test coverage with inline snapshot 