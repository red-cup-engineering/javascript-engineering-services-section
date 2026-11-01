;;; Registered construction Data is interpreted by Code's original constructor.
;;; It cannot select a Scheme module, procedure, or private product constructor.
(define-module (native-code-declaration)
  #:use-module (native-code-programme)
  #:use-module (guix store)
  #:use-module (ice-9 regex)
  #:use-module (srfi srfi-1)
  #:use-module (json)
  #:export (native-code-construction-from-declaration))

(define fields
  '("archiveInputs" "bill" "entry" "guile" "incumbent" "kind" "node" "parser"
    "policy" "source" "sourceName"))

(define (registered path kind)
  (let* ((match (and (string? path)
                 (string-match "^(/gnu/store/[a-z0-9]{32}-[^/]+)(/.*)?$" path)))
         (root (and match (match:substring match 1))))
    (unless (and root (equal? path (canonicalize-path path))
              (eq? kind (stat:type (lstat path)))
              (with-store store (valid-path? store root)))
      (error "registered unredirected native construction Data required" path))
    path))

(define (bounded-json path limit)
  (registered path 'regular)
  (unless (and (> (stat:size (lstat path)) 0) (<= (stat:size (lstat path)) limit))
    (error "bounded native construction declaration required"))
  (call-with-input-file path json->scm))

;; A package identity may use its immutable contextual link. Resolve it only
;; within that same registered provider root; preserve the declared identity.
(define (registered-incumbent path)
  (let* ((match (and (string? path)
                 (string-match "^(/gnu/store/[a-z0-9]{32}-[^/]+)/(.+)$" path)))
         (root (and match (match:substring match 1)))
         (target (and root (canonicalize-path path))))
    (unless (and root
              (every (lambda (part) (not (member part '("" "." ".."))))
                (string-split (match:substring match 2) #\/))
              (string-prefix? (string-append root "/") target)
              (eq? 'directory (stat:type (lstat target)))
              (with-store store (valid-path? store root)))
      (error "native incumbent leaves its registered provider" path))
    path))

(define (native-code-construction-from-declaration file)
  (let* ((data (bounded-json file 65536))
         (archives (assoc-ref data "archiveInputs"))
         (name (assoc-ref data "sourceName")))
    (unless (and (list? data) (equal? fields (sort (map car data) string<?))
              (equal? "native-code-construction-declaration/v1" (assoc-ref data "kind"))
              (string? name) (string-match "^[A-Za-z0-9][A-Za-z0-9+._-]{0,127}$" name)
              (vector? archives) (> (vector-length archives) 0)
              (<= (vector-length archives) 32))
      (error "exact native Code construction declaration required"))
    (registered (assoc-ref data "source") 'directory)
    (registered-incumbent (assoc-ref data "incumbent"))
    (for-each (lambda (key) (registered (assoc-ref data key) 'regular))
      '("node" "parser" "guile"))
    ;; A public policy export is resolved only inside the formed immutable
    ;; selected graph by the original materializer, which confines the result.
    (let ((policy (assoc-ref data "policy")))
      (unless (and (string? policy)
                (or (and (string-prefix? "/" policy) (registered policy 'regular))
                    (string-match "^(@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$" policy)))
        (error "original selected native policy module required")))
    (for-each (lambda (path) (registered path 'regular)) (vector->list archives))
    (bounded-json (assoc-ref data "bill") 1048576)
    (native-code-construction (assoc-ref data "source") (assoc-ref data "entry")
      #:node-program (assoc-ref data "node") #:parser-module (assoc-ref data "parser")
      #:policy-module (assoc-ref data "policy") #:bill-file (assoc-ref data "bill")
      #:incumbent-package (assoc-ref data "incumbent") #:guile-for-build (assoc-ref data "guile")
      #:source-name name #:archive-inputs archives)))
