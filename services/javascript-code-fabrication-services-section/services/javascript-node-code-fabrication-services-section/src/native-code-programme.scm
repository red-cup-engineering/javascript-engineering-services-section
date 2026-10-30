;;; Code's immutable native Node programme constructor.  Systems consumes its
;;; typed product; neither construction nor receiving starts an application.
(define-module (native-code-programme)
  #:use-module (guix gexp)
  #:use-module (guix store)
  #:use-module (guix monads)
  #:use-module (guix derivations)
  #:use-module (ice-9 match)
  #:use-module (ice-9 regex)
  #:use-module (srfi srfi-1)
  #:use-module (srfi srfi-9)
  #:use-module (json)
  #:export (native-code-construction native-code-construction-input
            receive-native-code-output native-code-product-input native-code-product-entry
            native-code-product-programme-runtime native-code-product? native-code-product-binds-source?))

(define materializer
  (local-file (string-append (dirname (search-path %load-path "native-code-programme.scm"))
                            "/materialize-native-code-programme.mjs")
              "materialize-native-code-programme.mjs"))

(define-record-type <native-code-construction>
  (%construction input package entry programme-runtime)
  construction?
  (input construction-input)
  (package construction-package)
  (entry construction-entry)
  (programme-runtime construction-programme-runtime))
(define-record-type <native-code-product>
  (%product input entry programme-runtime)
  product?
  (input product-input)
  (entry product-entry)
  (programme-runtime product-programme-runtime))

;; Systems resolves the public interface with module-ref.  SRFI-9's generated
;; accessor syntax is private; export ordinary procedures for dynamic callers.
(define (native-code-construction-input value) (construction-input value))
(define (native-code-product-input value) (product-input value))
(define (native-code-product-entry value) (product-entry value))
(define (native-code-product-programme-runtime value) (product-programme-runtime value))

(define native-code-product? product?)
(define (native-code-product-binds-source? product source)
  (and (product? product) (string? source)
       (equal? source (native-code-product-input product))
       (equal? source (canonicalize-path source))))

;; JSON object identity does not depend on property order.  Preserve the exact
;; key/value set across Guile/Node serialization rather than comparing the
;; incidental order of their association-list representations.
(define (package-identity=? expected actual)
  (and (list? expected) (list? actual)
       (equal? (sort expected (lambda (a b) (string<? (car a) (car b))))
               (sort actual (lambda (a b) (string<? (car a) (car b)))))))

(define (store-item path)
  (let ((m (and (string? path)
                (string-match "^(/gnu/store/[a-z0-9]{32}-[^/]+)(/.*)?$" path))))
    (unless m (error "selected registered native store input required" path))
    (let ((root (match:substring m 1)) (suffix (or (match:substring m 2) "")))
      (unless (and (equal? path (canonicalize-path path))
                   (not (member ".." (string-split suffix #\/))))
        (error "unredirected confined native store input required"))
      (with-store store
        (unless (valid-path? store root) (error "unregistered native input" root)))
      path)))

(define (regular-source path)
  (unless (and (string? path) (string-prefix? "/" path)
               (equal? path (canonicalize-path path)))
    (error "unredirected absolute native source input required"))
  path)

(define* (native-code-construction source entry
          #:key node-program parser-module policy-module bill-file incumbent-package guile-for-build
          source-name archive-inputs)
  (regular-source source)
  (regular-source bill-file)
  (unless (and (eq? 'directory (stat:type (lstat source)))
               (string? entry) (not (string-prefix? "/" entry))
               (not (member ".." (string-split entry #\/)))
               (string? policy-module) (string? incumbent-package))
    (error "exact native programme source/entry/provider inputs required"))
  (when (and source-name
             (or (not (string? source-name)) (string-null? source-name)
                 (member source-name '("." "..")) (string-contains source-name "/")))
    (error "single original source input basename required"))
  (let* ((bill (call-with-input-file bill-file json->scm))
         (package (assoc-ref bill "package"))
         (archives (assoc-ref bill "archives"))
         (providers (assoc-ref bill "providerInputs")))
    (unless (and (equal? "native-code-provider-bill/v1" (assoc-ref bill "kind"))
                 (list? package) (vector? archives) (> (vector-length archives) 0)
                 (<= (vector-length archives) 32) (vector? providers)
                 (> (vector-length providers) 0) (<= (vector-length providers) 8)
                 (any (lambda (root)
                        (and (string? root)
                             (string-prefix? (string-append root "/") incumbent-package)))
                      (vector->list providers)))
      (error "received bounded native provider bill required"))
    (when (and archive-inputs
               (or (not (vector? archive-inputs))
                   (not (= (vector-length archive-inputs) (vector-length archives)))))
      (error "exact original archive input selection required"))
    ;; Capture immutable registered providers as original Guix inputs.  The
    ;; programme contains no link to the mutable source or receiving directory.
    (let* ((node (store-item node-program))
           (parser (store-item parser-module))
           (roots (map store-item (vector->list providers)))
           (archive-input-files
             (map (lambda (a supplied)
                    (let ((file (regular-source (or supplied (assoc-ref a "archive")))))
                      (when supplied (store-item file))
                      (unless (eq? 'regular (stat:type (lstat file)))
                        (error "regular original archive required"))
                      (cons a (local-file file (basename (assoc-ref a "archive"))))))
                  (vector->list archives)
                  (if archive-inputs (vector->list archive-inputs)
                      (make-list (vector-length archives) #f))))
           )
      ;; Tool selection is explicit in the bill; no machine-specific package
      ;; version or provider path is inferred by this generic Code constructor.
      (define tar
        (store-item (assoc-ref (assoc-ref bill "archiveExtractor") "module")))
      (define descriptor
        (scm->json-string
          (list (cons "version" 1) (cons "source" "") (cons "entry" entry)
                (cons "nodeProgram" node) (cons "parserModule" parser)
                (cons "policyModule" policy-module) (cons "tarModule" tar)
                (cons "bill" bill) (cons "output" ""))))
      (define input
        (computed-file "native-code-programme"
          #~(begin
              ;; A literal subpath is not itself a direct Guix store input.
              ;; Retain the selected Node root explicitly without reimporting
              ;; its tree or selecting another toolchain.
              (define node-input #$(match:substring
                  (string-match "^(/gnu/store/[^/]+)" node-program) 1))
              (define provider-inputs (list #$@roots))
              (call-with-output-file "native-code-input.json"
                (lambda (port) (display #$descriptor port)))
              (unless (zero?
                (apply system* #$node "--experimental-import-meta-resolve" #$materializer
                  "--guix-inputs" "native-code-input.json"
                  #$(local-file source (or source-name (basename source)) #:recursive? #t) #$output
                  (list #$@(map cdr archive-input-files))))
                (error "native Code programme construction refused")))
          #:options (if guile-for-build
                        (list #:guile-for-build (read-derivation-from-file guile-for-build))
                        '())))
      (%construction input package
        (string-append "node_modules/" (assoc-ref package "name") "/" entry) node-program))))

(define (receive-native-code-output construction output)
  (unless (construction? construction) (error "original Code construction required"))
  (with-store store
    (let* ((drv (run-with-store store
                  (lower-object (native-code-construction-input construction))))
           (expected (derivation->output-path drv)))
      (unless (and (equal? output expected) (valid-path? store output)
                   (equal? output (canonicalize-path output)))
        (error "native Code output differs from its original construction"))
      (let* ((receipt (call-with-input-file
                         (string-append output "/native-code-receiving.json") json->scm))
             (entry (construction-entry construction)))
        (unless (and (equal? "native-code-programme.received/v1" (assoc-ref receipt "kind"))
                     (package-identity=? (construction-package construction) (assoc-ref receipt "package"))
                     (equal? entry (assoc-ref receipt "entry"))
                     (equal? #f (assoc-ref receipt "applicationExecuted"))
                     (file-exists? (string-append output "/" entry)))
          (error "native Code output lacks its original receiving"))
        (%product output entry (construction-programme-runtime construction))))))

