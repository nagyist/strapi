import type { Transform, JSCodeshift, ASTPath, ObjectExpression } from 'jscodeshift';

const transformDeclaration = (path: ASTPath<any>, name: any, j: JSCodeshift) => {
  const declaration = findClosesDeclaration(path, name, j);

  if (!declaration) {
    return;
  }

  transformElement(path, declaration.init, j);
};

const transformElement = (path: ASTPath<any>, element: any, j: JSCodeshift) => {
  switch (true) {
    case j.ObjectExpression.check(element): {
      transformObjectParam(path, element, j);
      break;
    }

    case j.Identifier.check(element): {
      transformDeclaration(path, element.name, j);
      break;
    }

    case j.SpreadElement.check(element): {
      transformElement(path, element.argument, j);
      break;
    }

    case j.ArrayExpression.check(element): {
      element.elements.forEach((element) => {
        transformElement(path, element, j);
      });
      break;
    }
    default: {
      break;
    }
  }
};

const transformObjectParam = (path: ASTPath<any>, expression: ObjectExpression, j: JSCodeshift) => {
  expression.properties.forEach((prop) => {
    switch (true) {
      case j.ObjectProperty.check(prop): {
        if (!j.Identifier.check(prop.key) && !j.Literal.check(prop.key)) {
          return;
        }

        if (j.Identifier.check(prop.key) && prop.key.name !== 'publicationState') {
          return;
        }

        if (j.Literal.check(prop.key) && prop.key.value !== 'publicationState') {
          return;
        }

        if (j.Identifier.check(prop.key) && prop.key.name === 'publicationState') {
          if (!prop.computed && !prop.shorthand) {
            prop.key.name = 'status';
          }

          if (prop.shorthand && !prop.computed) {
            prop.shorthand = false;
            prop.key = j.identifier('status');
            prop.value = j.identifier('publicationState');
          }
        } else if (j.Literal.check(prop.key) && prop.key.value === 'publicationState') {
          prop.key.value = 'status';
        }

        switch (true) {
          case j.Literal.check(prop.value): {
            prop.value = prop.value.value === 'live' ? j.literal('published') : j.literal('draft');

            break;
          }
          case j.Identifier.check(prop.value): {
            const declaration = findClosesDeclaration(path, prop.value.name, j);

            if (!declaration) {
              return;
            }

            if (j.Literal.check(declaration.init)) {
              declaration.init =
                declaration.init.value === 'live' ? j.literal('published') : j.literal('draft');
            }

            break;
          }
          default: {
            break;
          }
        }

        break;
      }
      case j.SpreadElement.check(prop): {
        transformElement(path, prop.argument, j);
        break;
      }
      default: {
        break;
      }
    }
  });
};

const findClosesDeclaration = (path: ASTPath<any>, name: string, j) => {
  // find Identifier declaration
  const scope = path.scope.lookup(name);

  if (!scope) {
    return;
  }

  return j(scope.path)
    .find(j.VariableDeclarator, { id: { type: 'Identifier', name } })
    .nodes()[0];
};

const transform: Transform = (file, api) => {
  const j = api.jscodeshift;

  const root = j(file.source);

  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        object: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'strapi',
          },
          property: {
            type: 'Identifier',
            name: 'entityService',
          },
        },
      },
    })
    .replaceWith((path) => {
      if (!j.MemberExpression.check(path.value.callee)) {
        return;
      }

      const args = path.value.arguments;

      if (args.length === 0) {
        // we don't know how to transform this
        return;
      }

      type Args = typeof path.value.arguments;

      function resolveArgs(args: Args): Args {
        return args.flatMap((arg: Args[number]) => {
          switch (true) {
            case j.Identifier.check(arg):
            case j.Literal.check(arg): {
              return arg;
            }
            case j.SpreadElement.check(arg): {
              switch (true) {
                case j.Identifier.check(arg.argument): {
                  const identifier = arg.argument;

                  const declaration = findClosesDeclaration(path, identifier.name, j);

                  if (!declaration) {
                    return arg;
                  }

                  switch (true) {
                    case j.ArrayExpression.check(declaration.init): {
                      return resolveArgs(declaration.init.elements);
                    }
                    default:
                      return arg;
                  }
                }
                case j.ArrayExpression.check(arg.argument): {
                  return resolveArgs(arg.argument.elements as Args);
                }
                default: {
                  return arg;
                }
              }
            }
            default: {
              return arg;
            }
          }
        });
      }

      const resolvedArgs = resolveArgs(args);

      const [docUID, ...rest] = resolvedArgs;

      path.value.arguments.forEach((arg) => {
        transformElement(path, arg, j);
      });

      return j.callExpression(
        j.memberExpression(
          j.callExpression(j.memberExpression(j.identifier('strapi'), j.identifier('documents')), [
            docUID,
          ]),
          path.value.callee.property
        ),
        rest
      );
    });

  return root.toSource();
};

export const parser = 'tsx';

export default transform;
