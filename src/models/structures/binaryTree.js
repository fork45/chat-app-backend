class Node {
    constructor(value, right = null, left = null) {
        this.value = value
        this.right = right
        this.left = left
    }

    setRight(node) {
        this.right = node
    }

    setLeft(node) {
        this.left = node
    }
}

function findInBST(value, rootNode) {
    
}