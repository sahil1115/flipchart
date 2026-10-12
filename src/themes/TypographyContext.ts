import { createContext, useContext } from 'react';
import { defaultTypography } from '../storage/typography-preference';
export const TypographyContext = createContext(defaultTypography);
export const useTypography = () => useContext(TypographyContext);
