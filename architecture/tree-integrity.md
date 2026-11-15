# Document tree constraints

Create and update validate parent existence and reject self/descendant moves before mutation. Recursive operations track visited nodes so preexisting malformed cycles cannot recurse forever. The same checks apply to move and persistence entry points. Invalid operations preserve the previous tree in SQLite.

The transaction/tree regression suite covers direct/indirect cycles, nonexistent parents, valid reparenting, and deletion/trash traversal. Existing bad-tree data is rejected or traversed with bounded visited-node tracking; no automatic destructive cleanup is performed.
